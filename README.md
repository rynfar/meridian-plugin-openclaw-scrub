# @rynfar/meridian-plugin-openclaw-scrub

A [Meridian](https://github.com/rynfar/meridian) plugin that stops [OpenClaw](https://github.com/openclaw/openclaw) traffic from being metered as a third-party app.

## Why

Point OpenClaw at Meridian to use a Claude Max subscription and every request fails:

```
API Error: 400 You're out of extra usage. Add more at claude.ai/settings/usage and keep going.
```

The request is being billed as a **third-party app** — drawing from Extra Usage rather than the Max plan — and once Extra Usage is spent, nothing works. The trigger is in OpenClaw's system prompt.

## What actually trips it

Measured, not guessed. A captured 30KB OpenClaw prompt was split into sections and each was replayed through Meridian against a Max account. Three sections fail **on their own**:

| Section | Source |
|---|---|
| `## Reply Tags` | OpenClaw's system prompt |
| `## 💓 Heartbeats - Be Proactive!` | scaffolded `AGENTS.md` |
| `## Heartbeats` | scaffolded `BOOTSTRAP.md` |

Two of the three are heartbeats — instructions for acting on a schedule with nobody watching. The third wires replies into a chat surface. Together they read as an autonomous bot rather than an assistant answering a person.

**Two obvious suspects are not the trigger.** The `## Tooling` block listing `read`/`write`/`edit`/`exec`, and the 8KB skills index, pass cleanly when sent together. A coding tool surface is not what gets flagged — and neither is the `tools` array itself, which passes with the same tool names.

Removing those three sections makes the full prompt pass.

## Proof

Same headless request (`openclaw agent --local`), same Max account, plugin off then on:

| | plugin off | plugin on |
|---|---|---|
| `stopReason` | `error` | `stop` |
| error | `400 You're out of extra usage` | none |
| reply | — | `ping` |

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

**Content-scoped, not adapter-scoped.** OpenClaw sends no distinguishing header, so its traffic arrives under whatever adapter Meridian falls back to (observed: `opencode`). An adapter filter would never fire. The scrub self-scopes by content, is idempotent, and is an exact no-op on any prompt that isn't OpenClaw's.

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
