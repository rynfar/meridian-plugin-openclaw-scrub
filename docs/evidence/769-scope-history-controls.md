# OpenClaw prompt scoping and heartbeat preservation — #769

These corrections address two reproducible plugin defects, independently of
the moving billing-classifier report in
[#769](https://github.com/rynfar/meridian/issues/769). They add no new scrub
rule for that undisclosed trigger, adapter feature or public plugin interface.
The issue remains open for its affected-flow evidence.

On unchanged source `6192a1cfb9c244268b08b8f9bbc85ac9a00243d2`, adding the
regression assertions in `src/__tests__/scrub.test.ts` yielded **25 pass,
19 fail**, exit 1, with Bun 1.3.11. The 24 existing tests and the new empty-reply
control passed. Product source hashes stayed unchanged during that before run.
The same assertions detect generic Documentation removal, lost tool calls and
orphaned results, mixed acknowledgments, attachments, unknown/thinking blocks,
malformed content and useful intervening messages.

Prompt recognition now requires the existing OpenClaw identity line or
reply-directive syntax. The generic Documentation heading cannot establish
identity; its cosmetic removal still applies to the captured OpenClaw fixture.
The old/new directive headings, identity replacement and idempotence remain
covered by the existing controls.

Heartbeat trimming requires a completely understood text payload and a whole
disposable interval: adjacent unanswered polls, or one lone empty/exact-ack
assistant reply before the next poll. Tool-bearing, attached, unknown,
malformed or multi-message turns remain intact. The newest poll, text alerts,
message identities and the on-disk client transcript remain preserved.

Run the source suite and compiler checks:

```sh
npm test
npm run build
npx --no-install tsc --noEmit
```

The standalone installed-package control imports the compiled entry selected
by that package's actual exports, without importing source, Meridian, an SDK,
or a client. It exercises the real exported hook on deterministic public
fixtures; it does not make a model call.

```sh
npm pack --ignore-scripts
# Install the resulting tarball into a new isolated directory with hooks disabled.
node scripts/e2e-installed-hook.mjs \
  /absolute/isolated/node_modules/@rynfar/meridian-plugin-openclaw-scrub \
  src/__tests__/fixtures/openclaw-system-prompt.txt
```

The review checkpoint/PR validation records the exact source head, failed-before
and final passing counts, compiler/package commands, tarball hashes and fresh
installed-entry result. The local pack is unpublished and retains version
0.1.0; neither these unit/hook controls nor an installed plugin prove that the
original OpenClaw deployment or September prompt now avoids a billing refusal.
