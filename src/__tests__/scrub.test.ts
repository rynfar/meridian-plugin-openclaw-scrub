import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { looksLikeOpenClaw, scrubOpenClawFingerprints } from "../scrub.js"
import { scrubOpenClawHeartbeatHistory } from "../history.js"
import plugin from "../index.js"

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

  // OpenClaw renamed this section between 2026.4.x and 2026.7 — the exact
  // failure a heading list would hit silently, reported in #769 by someone
  // running the newer build. Matching on the directive syntax survives it.
  it("removes the directive block under its 2026.7+ heading", () => {
    const modern = [
      "You are a personal assistant running inside OpenClaw.",
      "## Tooling",
      "- read: Read file contents",
      "## Assistant Output Directives",
      "- Directive starts line, plain text, outside fences/Markdown; never inline or wrapped.",
      "- Native reply starts with [[reply_to_current]]; use [[reply_to:<id>]] only with an explicit id.",
      "- Directives stripped before render; channel config controls delivery.",
      "## Messaging",
      "- Reply in current session",
    ].join("\n")

    const out = scrubOpenClawFingerprints(modern)
    expect(out).not.toContain("## Assistant Output Directives")
    expect(out).not.toContain("[[reply_to_current]]")
    // and nothing else goes with it
    expect(out).toContain("## Tooling")
    expect(out).toContain("- read: Read file contents")
    expect(out).toContain("## Messaging")
  })

  it("recognises a 2026.7+ prompt even without the 2026.4 identity line", () => {
    const modern = "## Assistant Output Directives\n- Native reply starts with [[reply_to_current]].\n## Messaging\n- x"
    expect(looksLikeOpenClaw(modern)).toBe(true)
    expect(scrubOpenClawFingerprints(modern)).not.toContain("reply_to_current")
  })

  it("reduces the brand tell without gutting functional text", () => {
    const count = (s: string) => (s.toLowerCase().match(/openclaw/g) ?? []).length
    expect(count(scrubbed)).toBeLessThan(count(REAL))
    // Most of the prompt survives: this is a scalpel, not a truncation.
    expect(scrubbed.length).toBeGreaterThan(REAL.length * 0.7)
  })
})

describe("scrubOpenClawHeartbeatHistory", () => {
  const poll = (time: string) => ({
    role: "user",
    content: [{ type: "text", text: `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.\nCurrent time: ${time}` }],
  })

  it("keeps only the newest unanswered poll in a failed replay", () => {
    const messages = [
      { role: "user", content: "ordinary request" },
      { role: "assistant", content: [{ type: "text", text: "ordinary reply" }] },
      poll("10:00"),
      poll("10:30"),
      poll("11:00"),
    ]
    const out = scrubOpenClawHeartbeatHistory(messages)
    expect(out).toEqual([messages[0], messages[1], messages[4]])
  })

  it("removes old exact acknowledgments together with their polls", () => {
    const messages = [
      poll("10:00"),
      { role: "assistant", content: "HEARTBEAT_OK" },
      poll("10:30"),
      { role: "assistant", content: [{ type: "text", text: "HEARTBEAT_OK" }] },
      poll("11:00"),
    ]
    expect(scrubOpenClawHeartbeatHistory(messages)).toEqual([messages[4]])
  })

  it("preserves a heartbeat turn that produced a real alert", () => {
    const messages = [
      poll("10:00"),
      { role: "assistant", content: "Build is failing on main." },
      poll("10:30"),
      poll("11:00"),
    ]
    const out = scrubOpenClawHeartbeatHistory(messages)
    expect(out).toEqual([messages[0], messages[1], messages[3]])
  })

  it("is an exact no-op with zero or one heartbeat poll", () => {
    const ordinary = [{ role: "user", content: "Read HEARTBEAT.md only if I ask." }]
    expect(scrubOpenClawHeartbeatHistory(ordinary)).toBe(ordinary)
    const one = [poll("11:00")]
    expect(scrubOpenClawHeartbeatHistory(one)).toBe(one)
  })

  it("does not treat quoted or assistant-side heartbeat text as a poll", () => {
    const messages = [
      { role: "user", content: `Please explain this text: Read HEARTBEAT.md if it exists (workspace context).` },
      { role: "assistant", content: `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.` },
      poll("11:00"),
    ]
    expect(scrubOpenClawHeartbeatHistory(messages)).toBe(messages)
  })
})

describe("plugin request transform", () => {
  const heartbeat = {
    role: "user",
    content: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.",
  }

  it("scrubs both prompt and stale heartbeat replay for OpenClaw", () => {
    const ctx = {
      adapter: "pi",
      systemContext: REAL,
      messages: [heartbeat, heartbeat],
      metadata: { keep: true },
    }
    const out = plugin.onRequest!(ctx)
    expect(out).not.toBe(ctx)
    expect(out.systemContext).not.toContain("running inside OpenClaw")
    expect(out.messages).toEqual([heartbeat])
    expect(out.metadata).toBe(ctx.metadata)
  })

  it("returns the exact context for non-OpenClaw traffic", () => {
    const ctx = {
      adapter: "prime",
      systemContext: "You are a general purpose agent that uses code to solve tasks.",
      messages: [heartbeat, heartbeat],
      metadata: {},
    }
    expect(plugin.onRequest!(ctx)).toBe(ctx)
  })
})
