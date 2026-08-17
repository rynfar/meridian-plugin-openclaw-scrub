/**
 * Meridian plugin: strip OpenClaw's identity and documentation fingerprints
 * from the system prompt before it reaches Claude.
 *
 * CONTENT-SCOPED, not adapter-scoped. OpenClaw speaks the Anthropic Messages
 * API but sends no distinguishing header, so its traffic arrives under whatever
 * adapter Meridian falls back to — observed as `opencode`. An adapter-scoped
 * filter would never fire. `scrubOpenClawFingerprints` self-scopes by content
 * and is an exact no-op on prompts that aren't OpenClaw's.
 */

import type { Transform, RequestContext } from "./types.js"
import { scrubOpenClawFingerprints, looksLikeOpenClaw } from "./scrub.js"
import { scrubOpenClawHeartbeatHistory } from "./history.js"

export type { Transform, RequestContext } from "./types.js"
export { scrubOpenClawFingerprints, looksLikeOpenClaw } from "./scrub.js"
export { scrubOpenClawHeartbeatHistory } from "./history.js"

const plugin: Transform = {
  name: "openclaw-scrub",
  version: "0.1.0",
  description:
    "Strip OpenClaw prompt fingerprints and stale heartbeat replay before they reach Claude (all adapters; content-scoped)",

  onRequest(ctx: RequestContext): RequestContext {
    if (!ctx.systemContext || !looksLikeOpenClaw(ctx.systemContext)) return ctx
    const systemContext = scrubOpenClawFingerprints(ctx.systemContext)
    const messages = Array.isArray(ctx.messages)
      ? scrubOpenClawHeartbeatHistory(ctx.messages)
      : ctx.messages
    if (systemContext === ctx.systemContext && messages === ctx.messages) return ctx
    return { ...ctx, systemContext, messages }
  },
}

export default plugin
