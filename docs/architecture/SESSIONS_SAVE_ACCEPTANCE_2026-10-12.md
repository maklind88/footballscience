# Sessions saved-work acceptance: restart checkpoint, 12 October 2026

Task owner: System / Security, shared persistence invariants and acceptance QA.
Affected owner: Sessions retains session/block semantics, writes and review rules.
Set Pieces remains a separate owner assessment. No module runtime, API, schema,
auth, permissions or production data is changed by this checkpoint.

Baseline: `8f2333d58deee481c1fcff846931f8e84d4ab202`, the verified production
release. Candidate: `codex/sessions-restart-acceptance-20261012`.
Applies the existing [saved-work contract](SAVED_WORK_CONTRACT_2026-10-09.md)
and [reliability program](../SAVING_RELIABILITY_PROGRAM_20260913.md).

## Finding and decision

Existing `session-save-storage` and `session-replay-coalescing` browser cases
exercise reload and new Pages in the same BrowserContext. Those are useful but
do not prove a full browser restart. The deployed two-user staging acceptance
also covers a short interruption and page reload, not process restart.

Add a focused acceptance test using the real Sessions save client and IndexedDB
store inside a fresh disk-backed persistent browser profile. Close the persistent
context (and its browser), then launch a new browser with the same profile.
There is no storageState export, journal serialization/reinjection, cache purge,
or test fixture copied back into IndexedDB. Every profile is a new temporary
synthetic profile, removed only after its browser is closed.

No new product defect was reproduced in these four scenarios, so no product
patch is justified. The change closes an evidence gap and provides a regression
gate instead of introducing another saving implementation.

## New acceptance evidence

`qa/session-browser-restart.smoke.spec.mjs` and its small helper exercise:

1. Commit the local journal, fail transport, close/reopen the browser, and show
   the exact immutable pending row over a fresh baseline with an independent peer
   field. Replay preserves both fields; another restart shows the confirmed value.
2. The same restart with a conflicting peer edit preserves central content and
   the local review, including another restart. Account, organization and team
   scopes are checked in separate browser launches: none displays or replays the
   original owner's pending row, and the row remains intact for that owner.
3. The synthetic server accepts A but its response is lost. Persist later B,
   restart, retry exact A, then fail B. A's receipt removes only A; B remains
   pending and the client is not settled. Restart again and confirm B separately.
4. A real IDB put request succeeds, then its transaction is explicitly aborted.
   Stage reports failure, the client is not settled, no send occurs and the
   prior durable row is unchanged after restart. Request success alone is not a
   durable transaction acknowledgement.

Chromium runs the new file automatically through the standard smoke matcher.
The existing save-WebKit config also includes it. No new dependency or CI
workflow is introduced.

## Matrix against the common contract

| Requirement | Current evidence | Remaining boundary |
| --- | --- | --- |
| Normal save/read; absent initial record | Existing central-revision suite on released baseline; new confirmed journal reread | No new whole-product cold-start certificate |
| localStorage/IDB failures and quota | Existing recovery safety tests; new real IDB success-then-abort boundary | Full product combined quota/IDB failure and actual disk exhaustion incomplete |
| Working edit through refresh/retry/reload | Existing two-page projection/replay tests; new disk-profile browser restart | Uncommitted form text and unexpected process termination are separate |
| Newer changed/deleted baseline | New independent/conflicting field restart cases; existing recovery tombstone contracts | Deleted-baseline plus full restart is not newly proved here |
| Multiple users/tabs; generation ordering | Deployed staging acceptance 37972400723; existing two-editor/two-tab tests; new separate-generation retirement | Larger load and old/new client combinations remain |
| Lost reply / duplicate delivery | New exact client retry across restart, B survives A receipt; receipt API contracts | Synthetic server models deduplication; no new real DB/audit exactly-once proof |
| Scope/access changes | New actor/org/team restart separation; existing 403 and in-flight scope contracts | Actual revoked access with offline browser restart requires deployed proof |
| Upgrade/rollback, retention | Existing snapshot pruning excludes unresolved rows | Same-version restart only; mixed-version upgrade/rollback remains a required gate |
| Deployed acceptance / release | Baseline two-user staging acceptance; production 38246710939 | These new tests are local synthetic acceptance, no new deploy performed |

## Verification

Passed with no skips: four Chromium restart cases, 18 WebKit cases (four
restart plus 14 existing storage/review), 18 Chromium existing storage/replay/
two-editor cases, and 62 API contracts. After strengthening the unsettled-state
assertions, all four restart cases passed again in each engine. This represents
40 browser cases across the two engines and 62 contract cases, not a full
platform acceptance percentage.

`npm run qa:static`, explicit new-file syntax checks and `git diff --check` passed.
The existing 84 oversized-module warnings remain; budgets were not changed.
No new staging/production release, main integration, runtime edit or real-user
data mutation was performed. Exact-candidate remote CI has not been run.

Reproduce from this candidate checkout:

```sh
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-browser-restart.smoke.spec.mjs qa/session-save-storage.smoke.spec.mjs qa/session-replay-coalescing.smoke.spec.mjs qa/session-two-editor-offline.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-browser-restart.smoke.spec.mjs qa/session-save-storage.smoke.spec.mjs
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/session-replay-coalescing.api.spec.mjs qa/session-planner-recovery-safety.api.spec.mjs qa/session-save-receipts.api.spec.mjs
npm run qa:static
```

## Limits and next gate

This is graceful browser shutdown after awaited commit, not OS crash, power
loss, eviction, disk loss, or a tab closed before commit. IndexedDB may persist
committed data but cannot guarantee recovery after the storage device is lost.
The harness loads the real saving modules, not the full authenticated platform;
it supplies the fresh baseline and a synthetic revision/receipt transport.
It proves client behavior, not production auth, database effects or full offline
app startup. Existing full-app and staged acceptance remain complementary.

Next: old/new client and upgrade/rollback compatibility with unresolved work,
then interrupted-commit and combined full-product storage failure. Keep module
certification open until those gates and their deployed prerequisites are met.
Do not use cache deletion or automatic review resolution to make tests pass.

## Follow-up, 13 October: selected historical clients and schema upgrade

The [version compatibility checkpoint](SESSIONS_VERSION_COMPATIBILITY_2026-10-13.md)
adds bidirectional pending/review preservation and old/new tabs around a real
v1 -> v2 database upgrade. Thirty Chromium/WebKit cases passed. It also proves
that the pre-compatibility fixed-version reader is inaccessible after v2, while
current source recovers the exact pending work without deletion. This closes
only the tested client-pair boundary; whole-app rollback and arbitrary versions
remain uncertified. Unexpected process termination is the next separate gate.
