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

## Actual heartbeat replay gate

Meridian's [core message-history correction](https://github.com/rynfar/meridian/pull/1324)
now consumes the history returned by plugins. The manual native gate below
uses the actual OpenClaw CLI, two recognized heartbeat polls, a real read
tool/result pair and an ordinary follow-up. Its observer preserves the client's
body, headers and returned plugin history; it supplies no model response.
It reads only the public SDK session API for its owned, observed native target.

```sh
E2E_MERIDIAN_ENTRY=/absolute/installed/meridian/dist/server.js \
E2E_SDK_ENTRY=/absolute/installed/sdk/sdk.mjs \
E2E_NATIVE_BIN=/absolute/installed/native/claude \
E2E_OPENCLAW_BIN=/absolute/installed/openclaw/openclaw.mjs \
E2E_SCRUB_ENTRY=/absolute/installed/scrub/dist/index.js \
E2E_REFERENCE_SCRUB_ENTRY=/absolute/installed/unchanged-scrub/dist/index.js \
E2E_OUTPUT_DIR=/absolute/new/private/output \
E2E_EXPECT=candidate \
bun scripts/e2e-openclaw-heartbeat-native.mjs --prepare-only
# With those same variables, add E2E_TOKEN_FILE=/private/read-only/access-token
# and omit --prepare-only to run the actual affected flow.
```

The gate requires Linux, Bun 1.3.11, OpenClaw 2026.6.11, SDK 0.2.141 and
native Claude Code 2.1.284, with wire `opus[1m]` and observed Opus 5.5.
Its isolated OpenClaw config uses the supported
`agents.defaults.envelopeTimestamp: "off"` setting so the actual CLI sends
the recognized heartbeat prefix first. Default timestamp-prefixed CLI turns
are outside this heartbeat recognition case. Historical tool calls/results
are checked both at plugin ingress and in Meridian's explicit, identity-bearing
SDK replay text; fresh SDK queries do not import native assistant blocks.
The unchanged plugin's pure history export runs only on a clone of each
received client history as a reference control. Candidate acceptance requires
that this exact history would lose its real call under the old transform;
the reference is never applied to the live request or supplied to the model.
Preparation needs no credential or network. The caller must mount a private,
owner-only access-token file read-only, supervise the original outer process
or container, and remove the token only after its terminal custody audit.
The gate bounds admission, child and captured-pipe joins, SDK factory/iterator/
close, public history reads and owned HTTP resources. Original failing runtime
and missing-custody witnesses remain failures. It never establishes global
descendant absence, publication, the reporter's Kubernetes tuple, or current
billing-classifier acceptance.

## 2026-10-09 native before/after qualification

The [portable sanitized receipt](769-native-heartbeat-20261009.json) records the
exact package and harness identities, versions, assertions, original process
closure and remaining holds. The same 44 assertions on CI's Bun 1.3.14 yield
25 pass / 19 fail on unchanged main and 44 pass / zero fail on the correction;
typecheck and build pass. The corrected unpublished tarball has all 19 members
matching the prior native-tested package exactly.

With actual OpenClaw 2026.6.11, SDK 0.2.141, native Claude Code 2.1.284 and
literal `opus[1m]` (observed `claude-opus-5-5[1m]`) on Linux arm64, the unchanged
plugin receives five messages containing two polls and one real read call/result
pair. It returns three messages with the call removed and its result retained.
The original fresh SDK input and public owned session history confirm that lost
call identity. The client can still return the receipt: successful wording alone
would miss the defect. The baseline gate exits 1 on its intended history-integrity
assertion, and that failure remains recorded.

The corrected arm retains all five messages and the original pair. It also
passes the ordinary actual-client follow-up. The old pure transform, evaluated
only on a clone of this exact candidate body, would orphan the call, so the
positive demonstrably exercises the faulty pruning case. All three candidate
stages return the real file receipt and retain the matching call/result identities
in supported SDK history. The final paired arms use three and four native SDK
queries respectively and the identical committed harness.

An earlier fixture attempt made two native queries and completed the real read,
but failed because the default CLI timestamp obscured the prefix and the fixture
expected native blocks instead of Meridian's rendered replay records. That failure
was preserved, diagnosed through pinned client/core source and public SDK APIs,
and corrected before the qualified pair. A preliminary corrected pair is retained;
the final pair strengthens it with the exact-body old-source negative control.
Sixteen native queries were made across those explicitly accounted-for runs.

Original child/stdio/SDK/public-read/HTTP and outer container waits joined. Owned
stopped containers were removed; the read-only access input stayed unchanged and
was removed after the terminal audit. No source login/refresh/write or private SDK
transcript inspection occurred. Global descendant absence remains unknown.

This accepts the bounded history correction and generic Documentation no-op.
It does not establish current classifier/billing acceptance, the original
Kubernetes tuple, or recognition of default timestamp-prefixed CLI polls.
Required final-head CI remains a merge gate. Meridian issue 769 stays open;
release, publication and fresh registry-install verification are separate.
