#!/usr/bin/env node
// Credentialless package-hook controls, not actual OpenClaw/model acceptance.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [packageRoot, fixturePath] = process.argv.slice(2)
assert.ok(packageRoot && fixturePath, "Pass the installed package root and public prompt fixture")
const metadata = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"))
assert.equal(metadata.name, "@rynfar/meridian-plugin-openclaw-scrub")
assert.equal(metadata.exports["."].default, metadata.main)
const entry = resolve(packageRoot, metadata.exports["."].default)
const { default: plugin, scrubOpenClawFingerprints, scrubOpenClawHeartbeatHistory } = await import(pathToFileURL(entry).href)
const real = readFileSync(fixturePath, "utf8")
const poll = () => ({ role: "user", content: "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK." })
const toolUse = { type: "tool_use", id: "fixture-read", name: "read", input: { path: "HEARTBEAT.md" } }
const toolResult = { role: "user", content: [{ type: "tool_result", tool_use_id: "fixture-read", content: "fixture checklist" }] }

const generic = { adapter: "pi", systemContext: "You are a generic assistant.\n## Documentation\nKeep the handbook.\n## Work\nAnswer the user.", messages: [poll(), poll()], metadata: { keep: true } }
assert.equal(plugin.onRequest(generic), generic)

const turns = [poll(), { role: "assistant", content: [toolUse] }, toolResult, poll()]
const ctx = { adapter: "pi", systemContext: real, messages: turns, metadata: { keep: true } }
const transformed = plugin.onRequest(ctx)
assert.equal(transformed.messages, turns)
assert.equal(transformed.messages[2], toolResult)
assert.equal(transformed.metadata, ctx.metadata)
assert.ok(!transformed.systemContext.includes("running inside OpenClaw"))
assert.ok(!transformed.systemContext.includes("## Documentation"))
assert.ok(!transformed.systemContext.includes("[[reply_to_current]]"))
assert.ok(transformed.systemContext.includes("## Tooling"))
assert.ok(transformed.systemContext.includes("## OpenClaw CLI Quick Reference"))
assert.equal(scrubOpenClawFingerprints(transformed.systemContext), transformed.systemContext)

for (const content of [
  [{ type: "text", text: "HEARTBEAT_OK" }, toolUse],
  [{ type: "thinking", thinking: "fixture" }],
  [{ type: "future_block", payload: "keep" }],
  [{ type: "text", text: 42 }],
  null,
]) {
  const messages = [poll(), { role: "assistant", content }, poll()]
  assert.equal(scrubOpenClawHeartbeatHistory(messages), messages)
}

const newest = poll()
assert.deepEqual(scrubOpenClawHeartbeatHistory([poll(), { role: "assistant", content: [] }, poll(), { role: "assistant", content: "HEARTBEAT_OK" }, newest]), [newest])
const attachment = { role: "user", content: [{ type: "text", text: poll().content }, { type: "document", source: "fixture" }] }
assert.deepEqual(scrubOpenClawHeartbeatHistory([attachment, poll(), newest]), [attachment, newest])
console.log(JSON.stringify({ result: "PASS", packageVersion: metadata.version, entry, scope: "CREDENTIALLESS_INSTALLED_PACKAGE_HOOK_ONLY", actualClientModelAcceptance: false }))
