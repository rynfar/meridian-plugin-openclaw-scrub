import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { looksLikeOpenClaw, scrubOpenClawFingerprints } from "../scrub.js"

/**
 * The real prompt OpenClaw 2026.4.2 sent through Meridian, captured on the
 * wire. Trimmed to the product-generated portion: everything from
 * "# Project Context" on is the user's own inlined files and is not ours to
 * ship. Machine-specific paths and timezone were neutralised.
 */
const REAL = readFileSync(
  join(import.meta.dir, "fixtures", "openclaw-system-prompt.txt"),
  "utf8",
)

describe("looksLikeOpenClaw", () => {
  it("recognises the captured prompt", () => {
    expect(looksLikeOpenClaw(REAL)).toBe(true)
  })

  it("does not fire on an unrelated prompt", () => {
    expect(looksLikeOpenClaw("You are a helpful assistant.\n## Tooling\n- read: Read file contents")).toBe(false)
  })
})

describe("scrubOpenClawFingerprints", () => {
  const scrubbed = scrubOpenClawFingerprints(REAL)

  it("replaces the identity line rather than leaving the model roleless", () => {
    expect(REAL).toContain("You are a personal assistant running inside OpenClaw.")
    expect(scrubbed).not.toContain("running inside OpenClaw")
    expect(scrubbed.startsWith("You are a helpful personal assistant.")).toBe(true)
  })

  // The three sections measured to trip the metering on their own.
  it("removes the Reply Tags section", () => {
    expect(REAL).toContain("## Reply Tags")
    expect(scrubbed).not.toContain("## Reply Tags")
    expect(scrubbed).not.toContain("[[reply_to_current]]")
  })

  it("removes every heartbeat section, whatever its heading", () => {
    expect(REAL).toContain("Heartbeats")
    expect(scrubbed).not.toMatch(/^##.*heartbeat/im)
    expect(scrubbed).not.toContain("Be Proactive")
  })

  // Measured NOT to matter, and the agent's only reference for managing its own
  // gateway. Removing it would cost function for no benefit.
  it("keeps the CLI quick reference", () => {
    expect(scrubbed).toContain("## OpenClaw CLI Quick Reference")
  })

  it("removes the documentation block, including docs, repo and community links", () => {
    expect(scrubbed).not.toContain("## Documentation")
    expect(scrubbed).not.toContain("docs.openclaw.ai")
    expect(scrubbed).not.toContain("github.com/openclaw/openclaw")
    expect(scrubbed).not.toContain("discord.com/invite/clawd")
    expect(scrubbed).not.toContain("clawhub.ai")
  })

  // Everything the agent needs to function has to survive, or the scrub trades
  // a metering problem for a broken assistant.
  it("preserves the tool list verbatim", () => {
    expect(scrubbed).toContain("## Tooling")
    expect(scrubbed).toContain("- read: Read file contents")
    expect(scrubbed).toContain("- exec: Run shell commands")
    expect(scrubbed).toContain("- memory_search: Mandatory recall step")
  })

  it("preserves behaviour sections", () => {
    for (const heading of [
      "## Tool Call Style",
      "## Safety",
      "## Skills (mandatory)",
      "## Memory Recall",
      "## Workspace",
      "## Messaging",
    ]) {
      expect(scrubbed).toContain(heading)
    }
  })

  it("preserves the skills index and its locations", () => {
    expect(scrubbed).toContain("<available_skills>")
    expect(scrubbed).toContain("/skills/coding-agent/SKILL.md")
    // Skill descriptions legitimately name the product; they are selection
    // criteria the agent matches against, not branding.
    expect(scrubbed.split("<description>").length).toBe(REAL.split("<description>").length)
  })

  it("is idempotent", () => {
    expect(scrubOpenClawFingerprints(scrubbed)).toBe(scrubbed)
  })

  it("is an exact no-op on a non-OpenClaw prompt", () => {
    const other = "You are OpenCode, the best coding agent on the planet.\n## Tooling\n- bash"
    expect(scrubOpenClawFingerprints(other)).toBe(other)
  })

  it("leaves the empty string alone", () => {
    expect(scrubOpenClawFingerprints("")).toBe("")
  })

  it("removes only the sections it claims to", () => {
    const headingsOf = (s: string) =>
      s.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.trim())
    const removed = headingsOf(REAL).filter((h) => !headingsOf(scrubbed).includes(h))
    expect(removed.sort()).toEqual([
      "## 💓 Heartbeats - Be Proactive!",
      "## Documentation",
      "## Heartbeats",
      "## Reply Tags",
    ].sort())
  })

  it("reduces the brand tell without gutting functional text", () => {
    const count = (s: string) => (s.toLowerCase().match(/openclaw/g) ?? []).length
    expect(count(scrubbed)).toBeLessThan(count(REAL))
    // Most of the prompt survives: this is a scalpel, not a truncation.
    expect(scrubbed.length).toBeGreaterThan(REAL.length * 0.7)
  })
})
