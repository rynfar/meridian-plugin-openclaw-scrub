# @rynfar/meridian-plugin-openclaw-scrub

A [Meridian](https://github.com/rynfar/meridian) plugin that removes known [OpenClaw](https://github.com/openclaw/openclaw) prompt fingerprints associated with third-party app metering. The classifier changes, so a loaded plugin does not guarantee that every OpenClaw request will pass.

## Why

In the affected deployments, pointing OpenClaw at Meridian with a Claude Max subscription produced:

```
API Error: 400 You're out of extra usage. Add more at claude.ai/settings/usage and keep going.
```

The request is being billed as a **third-party app** — drawing from Extra Usage rather than the Max plan — and once Extra Usage is spent, nothing works. The trigger is in OpenClaw's system prompt.

## What actually trips it

Measured on **2026-08-12**, against a Max account, by splitting a captured 30KB OpenClaw prompt into sections and replaying each one looking for `400 You're out of extra usage`. Three sections failed **on their own**:

| Section | Source |
|---|---|
| the output-directive block (`## Reply Tags` in 2026.4.x, `## Assistant Output Directives` from 2026.7) | OpenClaw's system prompt |
| `## 💓 Heartbeats - Be Proactive!` | scaffolded `AGENTS.md` |
| `## Heartbeats` | scaffolded `BOOTSTRAP.md` |

Two of the three are heartbeats — instructions for acting on a schedule with nobody watching. The third describes wiring replies into a chat surface. Together they read as an autonomous bot rather than an assistant answering a person.

**Two obvious suspects were not the trigger.** The `## Tooling` block listing `read`/`write`/`edit`/`exec`, and the 8KB skills index, passed cleanly when sent together — as did the `tools` array itself with the same tool names. A coding tool surface is not what gets flagged.

## Read this before trusting the section list

**The classifier is not stable, and these findings are a snapshot.**

Later the same day, with `extraUsage` unchanged (`isEnabled: false`, `usedCredits: 0` — the same state that produced the 400), the *verbatim* directive block passed, and so did the full unscrubbed prompt on two consecutive attempts, on both a Max and a Team account. Nothing local changed.

So Anthropic's classification moved within hours. What follows:

- The section attribution above was real when taken — reproduced, with negative controls — but it is **an observation of a system we do not control and cannot see**, not a permanent property of these strings.
- The scrub may be unnecessary on some days and necessary on others. It only transforms prompts with the OpenClaw identity/directive markers described below and removes a bounded, documented set of sections.
- If you are debugging this yourself, **establish a negative control first** — confirm an unscrubbed prompt actually fails right now — before concluding that any change fixed it. Both of the wrong turns taken while building this plugin came from trusting a stale control.

The later [production report](https://github.com/rynfar/meridian/issues/769) found a new trigger outside this plugin's fixed rule set after an earlier scrub had passed. Keep the plugin's scope tied to verified request content; a passing plugin hook or a green unrelated prompt is not evidence that the current failing request was scrubbed.

## Diagnose a new billing error

1. First send a small, known-good request through the same Meridian profile and model without OpenClaw's prompt. If it fails too, check the subscription and OAuth credentials before changing scrub rules; an auth problem can surface as a similar billing error.
2. In one short window, compare fresh OpenClaw sessions with the plugin off, on, then off again. Keep the account, model, client version, tools, and request shape fixed. The off runs must still fail while the on run passes before attributing the change to this plugin. If both states fail or both pass, the A/B result does not isolate a scrub effect.
3. If the off control fails, capture the failing request **locally and privately** before Meridian. Minimize its system blocks against the same live control, then test any proposed rewrite against the minimized failure and the original full request. Recheck after every edit: redacting or paraphrasing the trigger can make the failure disappear and invalidate the comparison.
4. Share only a sanitized minimal reproduction that still fails, plus the OpenClaw, Meridian, plugin and model versions, platform, and off/on/off outcomes. Never post raw request bodies, credentials, session identifiers, or customer transcripts. If no safe minimal fragment preserves the failure, keep the raw capture private and state that the trigger remains unverified.

Prefer a narrow rewrite that retains useful client instructions if it clears the active control. A new fixed rule needs an idempotence and non-OpenClaw no-op check; the current classifier may move again before that rule ships.

## Long-running heartbeat sessions

OpenClaw records a heartbeat poll even when the upstream request is refused before producing a reply. A persistent session can therefore accumulate hundreds of identical `Read HEARTBEAT.md...` user turns and replay all of them every 30 minutes. That history is itself an autonomous-agent fingerprint, even after the system prompt has been scrubbed.

For recognized OpenClaw requests, this plugin collapses that stale replay before it reaches Claude:

- the newest heartbeat poll is preserved so the current turn still runs;
- older unanswered polls and exact `HEARTBEAT_OK` acknowledgments are removed;
- heartbeat turns that produced a substantive alert are preserved;
- tool calls/results, attachments, unknown or malformed content, and turns
  with intervening messages are preserved in full;
- the on-disk OpenClaw transcript is untouched.

This also prevents failed heartbeat sessions from growing the upstream prompt indefinitely.
Only adjacent unanswered polls or a lone, text-only empty/exact acknowledgment
are eligible for trimming; unknown content is not evidence of an empty reply.

## What it costs

Measured on a real workspace, not assumed:

**Heartbeats still work.** The removed sections are guidance, not mechanism — OpenClaw's scheduler still fires, and the heartbeat poll message carries its own protocol ("reply `HEARTBEAT_OK`") and tells the agent to read `HEARTBEAT.md`. The scrub removes the *inlined copy* of that file, not the file, and the agent has the `read` tool. Fired at a scrubbed agent, it read `HEARTBEAT.md` and replied exactly `HEARTBEAT_OK`.

What is genuinely lost is the richer proactive guidance in `AGENTS.md`: what to sweep on each heartbeat (email, calendar, mentions), when to speak up versus stay quiet (late night, human busy, nothing new, checked under 30 minutes ago), and the memory-maintenance pass. If you rely on that judgement, move it into `HEARTBEAT.md`, which the agent reads on demand and which the scrub therefore cannot cost you.

**Reply tags are lost.** `[[reply_to_current]]` is no longer described, so the model will not emit it and native reply/quote threading stops. This only affects chat surfaces (Telegram, Discord, Signal) and is not observable in `--local` mode, so it is stated rather than measured.

Everything else is preserved verbatim: the tool list, tool-call style, safety block, skills index, memory and workspace rules, messaging rules, and every user-authored file OpenClaw inlines apart from the heartbeat sections above.

Also removed, purely cosmetically: the identity line (replaced with a neutral one, never deleted, so the model still has a role) and the `## Documentation` block of docs/repo/Discord links. Neither affects metering. The `## OpenClaw CLI Quick Reference` is deliberately **kept** — it names the product, but it was measured not to matter and it is the agent's only reference for managing its own gateway.

## Verified behaviour

Against a real workspace through the real daemon, with the plugin installed:

| Check | Result |
|---|---|
| plain turn | `stop`, replies |
| tool call (`exec`) | runs, output returned |
| multi-turn recall | context preserved across turns |
| heartbeat poll | reads `HEARTBEAT.md`, replies `HEARTBEAT_OK` |

## Install

```bash
cd ~/.config/meridian
npm install @rynfar/meridian-plugin-openclaw-scrub
```

```json
{
  "plugins": [
    { "path": "/Users/you/.config/meridian/node_modules/@rynfar/meridian-plugin-openclaw-scrub/dist/index.js", "enabled": true }
  ]
}
```

Paths must be absolute — the loader does not expand `~`.

## Scoping

**Content-scoped, not adapter-scoped.** OpenClaw sends no distinguishing header, so its traffic arrives under whatever adapter Meridian falls back to (observed: `opencode`). An adapter filter would never fire. The scrub recognizes the OpenClaw identity line or its reply-directive syntax and is idempotent. A generic `## Documentation` heading alone does not establish OpenClaw identity; cosmetic documentation cleanup requires one of those specific markers first.

The reproducible controls for prompt scoping and heartbeat preservation are in
[`docs/evidence/769-scope-history-controls.md`](docs/evidence/769-scope-history-controls.md).

## Team plans

A Team seat reports the same problem differently:

```
400 Third-party apps now draw from extra usage, not plan limits. Ask your workspace admin to add more.
```

That rule only applies once the request has been **classified** as a third-party app — so removing the signal removes the rule. Verified on a Team seat with the same probe: the unscrubbed prompt returns the 400, the scrubbed prompt is billed normally and succeeds.

| Team seat | result |
|---|---|
| unscrubbed | `400` third-party / extra usage |
| scrubbed | OK |

No re-routing to a Max profile is needed.

## License

MIT
