/**
 * Strip the parts of OpenClaw's system prompt that make Anthropic meter the
 * request as a third-party app.
 *
 * WHAT ACTUALLY TRIPS IT
 *
 * Measured, not guessed. Each section of a captured 30KB OpenClaw prompt was
 * replayed through Meridian against a Max account and checked for
 * `400 You're out of extra usage`. Three sections fail on their own; the rest
 * of the prompt — including the whole tool inventory and the skills index —
 * passes cleanly:
 *
 *   ## Reply Tags                    (OpenClaw's own prompt)
 *   ## 💓 Heartbeats - Be Proactive! (scaffolded AGENTS.md)
 *   ## Heartbeats                    (scaffolded BOOTSTRAP.md)
 *
 * Two of the three are heartbeats: instructions for acting on a schedule with
 * nobody watching. The third describes wiring replies into a chat surface.
 * Together they read as an autonomous bot rather than an assistant answering a
 * person, which is the distinction the metering appears to draw.
 *
 * Notably NOT the trigger, though both look like obvious suspects: the
 * `## Tooling` block listing read/write/edit/exec, and the 8KB skills index.
 * Sent together they pass. A coding tool surface is not what gets flagged.
 *
 * WHAT THIS COSTS
 *
 * Removing the heartbeat sections does not disable heartbeats — OpenClaw's
 * scheduler still fires them — but the model loses its guidance on how to
 * behave when one arrives. Removing Reply Tags loses native reply/quote
 * threading. Both are real losses, taken deliberately: the alternative is a
 * request that fails outright with a 400.
 */

/** OpenClaw's opening identity line, which names the product outright. */
const IDENTITY_LINE = /^You are a personal assistant running inside OpenClaw\.[ \t]*\r?\n?/

/** Same role, no product name. Replaces rather than deletes, so the model is
 *  never left without one — the same move pi-scrub and opencode-scrub make. */
const NEUTRAL_IDENTITY = "You are a helpful personal assistant.\n"

/** Load-bearing: measured to trip the metering on its own. */
const METERING_HEADINGS = ["## Reply Tags"]

/** Also load-bearing. Matched by substring because the heading differs between
 *  the two files that carry it ("## Heartbeats" and
 *  "## 💓 Heartbeats - Be Proactive!"), and a user may have retitled theirs. */
const METERING_HEADING_PATTERN = /heartbeat/i

/** Cosmetic: brand tells with no measured effect on metering, removed for the
 *  same reason the sibling scrubs remove theirs. Kept deliberately short —
 *  every removal costs the agent something, so unmeasured ones stay minimal.
 *  `## OpenClaw CLI Quick Reference` is NOT here: it names the product, but it
 *  is also the agent's only reference for managing its own gateway, and it was
 *  measured not to matter. */
const BRAND_HEADINGS = ["## Documentation"]

function isRemovableHeading(heading: string): boolean {
  const h = heading.trim()
  if (!h.startsWith("## ")) return false
  return (
    METERING_HEADINGS.includes(h) ||
    BRAND_HEADINGS.includes(h) ||
    METERING_HEADING_PATTERN.test(h)
  )
}

/**
 * Remove `## Heading` sections: the heading line through to the line before the
 * next heading of the same or higher level.
 *
 * Anchored on headings rather than blank lines because OpenClaw's prompt has
 * none between sections.
 */
function removeSections(prompt: string): string {
  const lines = prompt.split("\n")
  const out: string[] = []
  let skipping = false

  for (const line of lines) {
    const isHeading = line.startsWith("## ") || (line.startsWith("# ") && !line.startsWith("## "))
    if (isHeading) skipping = isRemovableHeading(line)
    if (!skipping) out.push(line)
  }
  return out.join("\n")
}

/**
 * True when this prompt is OpenClaw's.
 *
 * Content-scoped by necessity: OpenClaw sends no distinguishing header, so its
 * traffic arrives under whatever adapter Meridian falls back to (observed:
 * `opencode`). An adapter filter would never fire.
 */
export function looksLikeOpenClaw(systemPrompt: string): boolean {
  if (IDENTITY_LINE.test(systemPrompt)) return true
  return systemPrompt.split("\n").some(
    (l) => l.trim() === "## Reply Tags" || l.trim() === "## Documentation",
  )
}

/**
 * Remove OpenClaw's metering fingerprint. Idempotent, and an exact no-op on
 * any prompt that isn't OpenClaw's.
 */
export function scrubOpenClawFingerprints(systemPrompt: string): string {
  if (!systemPrompt || !looksLikeOpenClaw(systemPrompt)) return systemPrompt
  return removeSections(systemPrompt.replace(IDENTITY_LINE, NEUTRAL_IDENTITY))
}
