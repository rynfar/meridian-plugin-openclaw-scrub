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
import { scrubOpenClawFingerprints } from "./scrub.js"

export type { Transform, RequestContext } from "./types.js"
export { scrubOpenClawFingerprints, looksLikeOpenClaw } from "./scrub.js"

const plugin: Transform = {
  name: "openclaw-scrub",
  version: "0.1.0",
  description:
    "Strip OpenClaw's identity line and documentation sections from the system prompt before it reaches Claude (all adapters; content-scoped)",

  onRequest(ctx: RequestContext): RequestContext {
    if (!ctx.systemContext) return ctx
    const scrubbed = scrubOpenClawFingerprints(ctx.systemContext)
    if (scrubbed === ctx.systemContext) return ctx
    return { ...ctx, systemContext: scrubbed }
  },
}

export default plugin
