# Medical concurrency and mixed-client acceptance — 2026-10-31

**Release hold: acceptance failed.** The prepared timestamp correction is still
valid within its tested scope, but it does not resolve the confirmation defect
below. Do not treat the earlier 37 passing database tests as approval of this
broader user journey. No production/staging mutation or deployment was performed.

Owner: System / Security for bounded saved-work safety and this acceptance gate.
Medical retains clinical writes/rules; Sessions remains a consuming view. No
application source, clinical permission or ownership was changed in this task.

## Exact failure

1. A recommendation has been stored and its canonical event processed.
2. Another user clears it. Its canonical row is archived.
3. A stale client still holds the original active recommendation. On reconnect,
   its mutation can reach the server before its refresh succeeds.
4. The client sends the same original recommendation envelope and idempotency key.
5. The projector counts an already processed event as processed without checking
   whether that recommendation is still active. Its result is canonical_stored=true.
6. The API forwards that historical processing receipt as canonicalStored=true.
   Both tested client versions then show `recommendation already set` even though
   the recommendation remains archived centrally.

This is a false confirmation of current status, not evidence that the archive is
lost. Historical event acceptance and current clinical state are different facts.
Changing all duplicate responses to failures would also be wrong: unchanged
valid retries must remain idempotent and accepted.

## Evidence and limits

Application source: candidate `45a115cf50c62985ecd348b66767220331f714f0` versus
old/Live source `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`.
The only application-source differences are the four Medical/central-sync modules
already identified in the compatibility review. The mixed-client test serves those
exact four old modules via git show and checks that all four were actually loaded;
all remaining application files are unchanged between these sources.

| Check | Outcome | Proof boundary |
| --- | --- | --- |
| Two simultaneous recommendation writes for the same player/day | Passed: both distinct recommendation versions remain, revisions 11 and 12 | Two independent PostgreSQL connections, both observed waiting on the same aggregate lock before release; synthetic actor IDs, not an authenticated whole-platform test |
| First delivery of an older offline recommendation after newer work | Passed: both versions remain | Delayed event delivery to real projector, not a real browser offline cold restart |
| Original recommendation replayed after peer archival | FAILED: canonical_stored=true while archived=true, revision 12 | Real PostgreSQL projector, including the prepared timestamp correction |
| Old author + candidate peer | FAILED: old author shows `recommendation already set` after peer clears it | Real Chromium/application code; synthetic HTTP/auth |
| Candidate author + old peer | FAILED: candidate author shows the same incorrect message | Real Chromium/application code; synthetic HTTP/auth |

Quick recommendations append a new record identity. The parallel test deliberately
uses that actual data model; it does not certify concurrent field edits of a stable
record/plan ID. Both retained versions are asserted. No claim is made that the
whole application resolves every simultaneous same-entity edit or clock-skew case.

The browser test first captures a real original UI request, then checks that the
post-archive replay is byte-equivalent as a parsed envelope, including payload and
idempotency key. This matters because the API correctly rejects a reused key with
different payload content; that protection does not prevent this exact replay.
It records transient feedback as well as persistent text, because the old renderer
can erase a message on background refresh. Failed author refreshes simulate
independent endpoint/reconnect ordering; no repair write is allowed by the fixture.

Native PostgreSQL 17.11 result: 40 tests, 39 passed, 1 failed. This includes all 37
previously passing timestamp/baseline tests as controls. Both browser acceptance
tests fail on the intended no-false-confirmation assertion. Assertions were not
weakened to make the release green.

Native tools were isolated under `/private/tmp/medical-native-pg17`; no project
package or lockfile changed. Server: version-pinned npm package
`@embedded-postgres/darwin-arm64@17.11.0-beta.19`. Its missing psql client was built
from official PostgreSQL 17.11 source with the published SHA-256 verified. The
harness accepts only local Unix sockets, no remote connection credentials, and
removes each test database when finished.

Reproduction:

```sh
FS_RECOVERY_PG_BIN=/private/tmp/medical-native-pg17/package/native/bin node --test qa/medical-projection-forward-native.test.mjs qa/medical-multiwriter-acceptance-native.test.mjs
QA_PORT=49926 npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/medical-mixed-client-acceptance.smoke.spec.mjs --output=/private/tmp/medical-mixed-acceptance-final-artifacts --reporter=list
```

Local evidence:
- `/private/tmp/medical-multiwriter-acceptance-native.log`
- `/private/tmp/medical-mixed-acceptance-final.log`
- `/private/tmp/medical-mixed-acceptance-final-artifacts/`

## Required next correction, before another release recommendation

Define a backward-compatible response for an event whose original recommendation
has since been superseded or archived. Preserve the historical receipt, but do not
allow old clients to interpret it as confirmation of a currently active recommendation.
A new response field alone is insufficient because old clients ignore unknown fields.

The correction must retain journal content and exact idempotency keys, refuse any
automatic restoration of an archived recommendation, preserve local work, and make
the current client show the changed central status or an actionable review state.
Distinguish a clinical conflict from temporary network failure so retries do not
pretend the conflict was resolved. Keep the valid unchanged-retry case passing.

Review this contract with the existing Medical source-of-truth/permission boundary;
do not expand into a blanket rewrite, historical repair, cache clear or module
ownership transfer. Re-run these failing tests plus existing idempotency/visibility
checks after the correction. Real authenticated staging acceptance remains required
before claiming an end-to-end production-ready fix.

The observed SQL >= versus generic merge > equal-time behavior remains an additional
review finding; this task does not claim an end-to-end failure for every equal-time
or skewed-clock scenario. Sustained writers, real disk exhaustion, cold offline
restart, storage growth, all Medical forms and other modules remain unapproved.
