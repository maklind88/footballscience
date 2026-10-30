# Medical recommendation to Sessions: evidence and one feedback correction

**Current outcome — 2026-10-30 UTC:** the bounded staging recommendation journey
is approved on product commit `d1e9374df42e0d792ae49a245098df735e6d9821`, build
`dpl_EiWkM8G5aQp2AC5eVxUyjFUzkV2U`. Full QA/deploy run `40985824616` and
real four-case acceptance plus authenticated smoke `41008796744` passed.
Production remains `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`; no main integration
or production release occurred. Earlier pending/blocked entries below are the
investigation history, not the current status. This is not platform-wide
offline, storage-growth or concurrent-writer certification.


Task/release owner: System / Security, for the user-authorized saved-work
verification and scoped acknowledgement correction. Affected owners: Medical
Room owns clinical writes, permissions and recommendation rules; Sessions owns
its consuming view. Neither ownership nor clinical write/merge policy changes.
Governance: distributed-specialist-v4 and ENGINEERING_OPERATING_SYSTEM.md.

Candidate: `codex/medical-recommendation-journey-20261029`, isolated from main
`845a0ed9`. The source Medical binding is identical to the file used to reproduce
the defect on snapshot candidate `ccd8dafa`. PRs #289–292 remain separate. The
shared root's unrelated Video/Supabase work was not edited. No release authorized
or performed for this candidate.

## Trace before deciding what to change

The old saved-visibility fixture supplies an already-existing central record.
It proves cold read/render behavior, not creation through the real editor. The
new fixture begins with a roster/player and training day, but no recommendation.
It clicks the real 50% recommendation button and follows the generated record ID.
Remote authentication and server storage/projection are synthetic; browser UI,
auth boot, localStorage, queues, reads and module renderers are the actual code.

| Stage | Actual client path | Evidence |
| --- | --- | --- |
| User intent | `medical-runtime-bindings.mjs` -> `applyMedicalQuickRecommendation` | Real button; generated record ID/player/date/participation |
| Local intent | `medical-runtime-write-service.mjs` -> `writeMedicalState` | Native localStorage contains the submitted ID where cache is available; quota variant injects an actual failed browser write |
| Generic publication | Shared queue -> `/api/app-state` | Separately observed request and independently failed/accepted response |
| Medical event | `recordMedicalDatabaseSyncEvent` -> auth bridge -> `/api/medical` | Exact record ID and stable idempotency key; canonical reply deliberately held |
| Canonical confirmation | Medical event's `canonicalStored` result | No success feedback before this reply; lost reply retries the same synthetic event with one effect |
| Another reader | Empty independent context and distinct synthetic user -> `/api/app-state` GET | Read ledger includes the same record ID and revision; the test does not preseed a recommendation in the peer |
| Medical display | Selected date and `getLatestMedicalRecord` | Same ID/date/50% plus active recommendation button |
| Sessions display | Medical availability selectors and selected session date | 50% bucket contains exactly the sole test player; limited count agrees |
| Reload | Author and peer cold reads | Same record remains visible in both modules; author read count advances |

The test attaches a synthetic ledger for this run with request/commit/read
stages, generated IDs, revision and view scope. It never reads or logs live
clinical data or credentials. This is not production telemetry or a server audit.

## Reproduced defect and narrow correction

Deterministic failing sequence:

1. Click 50%; hold its canonical response.
2. Click 75%; both canonical attempts for the newer recommendation fail.
3. Observe the newer failure message.
4. Complete the older 50% response successfully.
5. Before the fix, the UI replaces the newer failure with `50% recommendation saved.`

The original failing browser test is retained in local evidence
`/private/tmp/medical-journey-race-before.log`. It is not evidence of an incident
in a particular user's historical record, or an explanation of every local review.

Quick-recommendation feedback is now bound to the view generation, account/team,
selected date and current edit permission. New recommendations, a new rendered
view, or intervening form input/change/submit invalidate the older feedback.
An unrelated click that does not change the view does not strand a valid reply
at "confirming". Both late success over newer failure and late failure over newer
success are tested. Old requests still complete normally; no event, clinical
state, server receipt, retry, deletion or merge is cancelled or rewritten.

This guard covers quick-recommendation feedback. It does not certify every other
Medical form's async rendering, central conflict resolution, or all account
transitions. It does not turn the global sync badge into a Medical receipt.

## Important partial-success distinction

The generic write and Medical event can succeed independently. With generic
publication accepted but the canonical event failing, the new record is readable
by a peer while Medical correctly refuses to claim its canonical confirmation.
Conversely, canonical publication can succeed while the generic queue fails.
The fixture exercises both directions. A single overall "saved/failed" label
cannot describe both states; further status design must preserve this distinction
rather than waive the missing canonical confirmation.

The first broad run exposed a test readiness mistake: waiting for the global
`isHydrated()` flag can hang when deliberately rejected queued writes coexist with
a successful Medical read. The fixture now requires app/auth readiness and an
observed Medical revision, then separately asserts fresh read identity, values and
both module views. No product readiness guard or assertion of persistence was
removed to make that fixture pass.

## Acceptance ledger

| Scenario | Evidence level | Status |
| --- | --- | --- |
| New recommendation -> receipt -> fresh peer -> Medical/Sessions -> reload | Real client and browser persistence; synthetic HTTP | Local test |
| Cache quota, generic write failure, canonical failure, both failures | Controlled independent faults; distinct outcomes | Local test |
| Lost canonical response and exact retry | Synthetic idempotent remote store; actual client retry | Local test; real database atomicity not inferred |
| Older success/newer failure | Reproduced browser failure before correction | Corrected candidate |
| Older failure/newer success; scope/date/permission/input/submit changes | Binding contracts; browser race above | Corrected candidate |
| Actual canonical API projection/error/idempotency behavior | Existing API contracts with simulated database transport | Separate regression layer |
| Real authenticated API/database chain on this exact published build | Staging frontend mismatch before login | Blocked; not passed |
| Sustained many-user load, real disk exhaustion, full offline startup | Outside this correction | Open |
| Other modules and Medical form variants | No blanket certification | Open |

## Published-environment gate

Read-only checks on 29 October 2026 found staging build
`dpl_4XHNHFWCkhyJ33QuscAi6FmeFWBE` with the expected staging backend hostname.
The existing frontend verifier rejected `src/core/central-sync-runtime-service.mjs`
because it differs from reviewed source. No login, fixture creation, historical
repair, export or cleanup was performed. Local staging credentials were absent;
existing GitHub workflows provide a protected runner path, not permission to
bypass version checks or to deploy.

Next real-environment acceptance must use the reviewed candidate on a pinned
isolated deployment, distinct authorized test users, a synthetic player/day and
strict run-owned writes/cleanup. Its browser guard must allow the real canonical
Medical event for that run: the existing broader staging test blocks all browser
POSTs for its Medical working-draft exercise and therefore cannot certify this
new-create flow unchanged. Roster and Schedule prerequisites must be explicit;
injected roster reads cannot be presented as a fully unmodified production flow.

A staging deployment needs the user's direct release instruction under AGENTS.md.
Only after the exact-version gate passes can authenticated acceptance count as
passed. Passing local tests or pre-existing CI is not a substitute.

## Final local validation

- 100 API/Chromium cases passed (37 API contracts and 63 Chromium cases).
- The same 63 browser cases passed in WebKit.
- `npm run qa:static` and `git diff --check` passed.
- Seven new full-client journey cases and seven additional binding cases are
  included in those totals. The deterministic stale-success case failed before
  the correction; it passes in both browser engines afterward.
- Fresh GitHub checks apply to the final candidate SHA. No staging, main or
  production release, real multiuser certification or all-module signoff follows
  from these 163 local cases.


## Authenticated acceptance preparation (next increment)

The previous candidate `039222f3` passed all GitHub checks, including all four
browser shards. That is candidate CI evidence, not a staging acceptance result.
This increment adds tests and runner wiring only; the product correction above
is unchanged. No staging workflow, deployment, account creation or data mutation
was executed against a remote environment during this preparation.

A separate, default-off `verify_medical_journey` input in Staging Smoke runs
`qa/medical-journey.staging.config.mjs`. It shares the existing non-cancelling
production-edge queue. A direct user release instruction is still required
before deploying the reviewed candidate to staging. Do not use a browser overlay
or an arbitrary green preview as proof of this candidate's published acceptance.

The suite covers four distinct scenarios:

- Normal UI creation, real generic write and canonical receipt.
- Real canonical acceptance followed by an intentionally dropped browser reply;
  the client's retry must receive the same event ID with `duplicate: true`.
- Generic delivery blocked while the canonical path remains real.
- Canonical delivery blocked while generic publication remains real; Medical
  must show the canonical failure even when the peer can read the record.

Each scenario starts without a recommendation for a unique run-owned player.
The record ID is generated by the real UI. A fail-closed guard checks its absence
in the initial and fresh server state, player/date/author/value, unchanged retry,
strict request shape and preservation of unrelated clinical state before allowing
POSTs. Startup writes and other modules are blocked. Existing Medical state must
already be compatible with the client: normalization, auto-closing historical
records or projected roster changes outside the fixture cause refusal rather
than permission to rewrite those records. This may expose an unmet prerequisite
on a busy/shared staging team; it is not a reason to weaken the ownership guard.

The browser sees an added synthetic roster row and a synthetic training/empty
session date. An unused nearby Sessions date is chosen; conflicting Schedule
content fails closed. These prerequisites are **browser-only fixtures**. Medical
GETs, recommendation POSTs and canonical receipts are real and unmodified, apart
from the explicitly selected transport fault. This certifies neither Squad and
Schedule persistence nor a fully unmodified platform-wide creation journey.

After the expected write responses, the test seals browser writes. A distinct
real authenticated peer and the author must then display the exact record ID,
date and 50% recommendation in Medical and in the Sessions selector/rendered
bucket, including new server reads after reload. This separation prevents a
queued author write during reload from manufacturing the persistence proof.
It does not certify generic retry recovery after reload or offline restart.

Every browser is closed before cleanup. Only IDs observed in accepted guard
intents may be archived through the canonical API. Records changed since the
intent are preserved and fail cleanup; the run-owned Medical player is archived
through the existing guarded generic helper. Audit events and archived synthetic
rows remain intentionally. Sessions, Schedule and Squad are not written. A
failed/interrupted cleanup is a failed run, not permission for broad deletion.
Process termination can still interrupt cleanup; retain the synthetic ID ledger
and inspect that run before retrying. No clinical payloads, credentials, traces,
screenshots or video are attached by the staging suite.

The source guard now includes the actual changed recommendation binding, its
write/operation/activity path and the Sessions selector/renderer. The existing
staging-restore test's stale hardcoded asset count was replaced with verification
of every manifest path both before and after alias assignment. No alias was
changed in this work.

Local rehearsal uses the same new request handler, ownership guard, real browser
requests and both view checks against a **synthetic local HTTP server**. Its first
run caught a test-phase problem: queued writes could still be attempted while
checking reload visibility. The explicit sealed read phase fixes the proof, not
product behavior. Local rehearsal does not substitute for real API/database,
authorization or concurrency validation on the published staging candidate.

Still open after this increment: actual authenticated staging execution and
cleanup evidence; simultaneous Medical writers/conflicts; offline reconnect and
restart against the real service; storage growth/physical quota; all other module
acceptance. No all-platform completion percentage or approval follows from this
suite being ready.

Preparation validation: 29 new API/guard cases, 4 new Chromium harness cases and
7 existing recommendation journey regressions passed (40 total); all 4 new
harness cases also passed in WebKit. The 34 existing fixture/frontend/staging
restore unit cases passed. `npm run qa:static`, `git diff --check` and collection
of all four opt-in staging cases passed. These are 78 local test executions;
the four actual staging cases were discovered, **not executed**.


## Authorized staging execution and test transport correction

The user explicitly approved staging publication and acceptance, with production
excluded. Workflow run 40900628744 published exact candidate
`c451afca86f043c701d98587a623fc352b35a65f` using the staging environment and passed
full QA and authenticated staging smoke. Staging build is
`dpl_EhTbUeLpapUbRMNv19zSb8QBn9tR`; all 19 frontend manifest assets match.
Production remained at `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`.

An earlier attempt to reuse the automatic branch preview (run 40899859114) was
rejected by the staging database/build identity guard before alias assignment.
No protection was bypassed; the ordinary staging-specific build was used.

The first real journey execution, run 40903085955, failed its author prerequisites
before arming or clicking the recommendation. The other three cases did not run.
This is not a successful saving acceptance. No cleanup failure was reported.

Inspection found that the test prerequisite reader parsed Sessions directly as
JSON, although the real read API supports gzip-base64-v1 objects. The test now
uses the existing server transport codec for decoding and negotiated re-encoding.
A regression checks compressed content, unchanged existing sessions, unchanged
raw Medical bytes and rejection of invalid transport. All four local browser
rehearsals now include a large synthetic Sessions payload. Failure diagnostics
report a fixed request phase and safe guard messages, never private response
bodies or transport exception contents. The actual cause of the first staging
failure remains unconfirmed until the instrumented rerun.

This correction changes test infrastructure only. The published product assets
remain the same; subsequent test-runner commits may target that exact staging
build only after the source manifest and backend/build guards pass again.

Correction validation: all 30 guard cases, all four Chromium and all four
WebKit rehearsals passed, as did `npm run check`, `npm run qa:static` and
`git diff --check`. These remain local checks, not a staging acceptance result.


The instrumented rerun (40904779917, test runner e3d6041b) identified an existing
Schedule activity on the selected date. It again stopped before any recommendation
click. The fixture selected a date unused by Sessions alone. The corrected selector
now reads both modules and chooses a nearby date unused in both; the browser
collision guards remain in place to catch changes after selection. A fully occupied
window fails before any recommendation. Schedule access added to the shared helper
is read-only; no Schedule write or historical repair is permitted.

Run 40905207325 confirmed that all 14 nearby dates are already occupied in at
least one planner. No recommendation was clicked. The synthetic fixture window
is now bounded at 90 future days, still requiring absence in both modules and
still rejecting collisions at browser read time. This expands only the choice
of test date, not permission to overwrite or share an existing session. Sessions
navigation uses the existing date buttons (10-day jumps); the local normal-mode
rehearsal now exercises a date 88 days ahead. A fully occupied 90-day window still
stops the test before any recommendation.


Run 40905953798 reached the synthetic recommendation, then failed during archival
with no canonical confirmation. It is not accepted. Read-only staging inspection
identified exactly one synthetic record and player from its time window and run
identity; no matching canonical sync event was present. The fixture is recorded
in `qa/fixtures/medical-journey-recovery-40905953798.json` with full synthetic
values for strict recovery comparison, not adoption based on an ID prefix.

A default-off recovery action uses the existing staging API, exact build/source
checks, the original author, optimistic revision, and exact equality of both rows.
It archives only those two rows and verifies all unrelated content remains equal.
Any content change, duplicate, new work or new plan refuses recovery. This is
cleanup of this test, not historical user-data repair. Canonical acceptance is not
relaxed: subsequent runs must first confirm Medical database capability is enabled.
The sanitized synthetic ledger is emitted before cleanup so a cleanup failure
cannot hide request stages in future CI runs.


## Staging outcome — 2026-10-29 16:04 UTC

- Product candidate c451afca remains published at staging build
  `dpl_EhTbUeLpapUbRMNv19zSb8QBn9tR`; full staging-deploy QA and smoke passed.
- Journey acceptance remains **failed / not approved**. Its normal case created
  one synthetic recommendation through generic app-state persistence, but no
  canonical event was found in that run window. The other three modes did not run.
- Authenticated capability inspection in recovery run 40907646457 confirmed HTTP
  200, `enabled:false`, `canWrite:true`, `databaseMode:false`. Staging Medical is
  in legacy mode. Canonical acceptance cannot pass in this configuration. No
  environment flag was changed or database migration applied in this task.
- Recovery run 40907646457 passed: exactly one unchanged synthetic record and
  one player archived through the API; unrelated content equal before/after;
  temporary account/session cleanup succeeded; all six authenticated staging
  smoke cases passed. Separate database readback confirmed both archival flags,
  revision 4288. No direct SQL mutation was used.
- Final test changes passed 32 guard cases, nine recovery refusal/ownership cases,
  targeted Chromium/WebKit future-date rehearsals, syntax, qa:static and diff
  checks. These do not replace the failed actual journey acceptance.
- Production client-config remained at
  `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`, with the production backend. This chat
  did not merge main or publish production.

Before another writing acceptance: review the staging-only Medical storage mode,
intended canonical projection setup and its compatibility with the target release.
Do not simply flip a mode or weaken canonical receipt requirements to get green.
Run the four cases only after the capability preflight passes. Simultaneous
writers, real offline restart, storage growth and other module acceptance remain
outside this completed staging publication and unresolved acceptance attempt.


## Forward-only staging alignment — current work, 2026-10-29

The previous disabled-mode blocker was investigated before changing configuration.
Staging lacked the September plan projector/validators and its event constraint
omitted medical-board-updated. Only definition changes were applied, not the
historical repair/replay part of that migration. Native PostgreSQL 17 acceptance
also exposed a real bug: using a future activity date as a write version could
silently suppress archival and allow older edits to replace newer ones. The
version helper now uses write metadata, matching the generic Medical merge path.

Migration `20261029171642` was applied only to staging project
`pokrksgempkuraueglpu`. All existing state/event content fingerprints remained
identical; role restrictions and invoker security were verified. Native run
40919578788 passed all 14 checks. Detailed fingerprints and guards are in
scripts/release-artifacts/medical-projection-forward-only.md. Production has not
received this schema change; the dormant artifact intentionally refuses replay
against any different baseline.

`MEDICAL_STORAGE_MODE=database` was added only to Vercel Preview branch `staging`.
Staging-deploy run 40920015062 passed Full QA and authenticated smoke, publishing
source `33ab9f179f21b42a0e8231af91a5ecb0c14d003b` as
`dpl_AgkZErLTos7F4ymG7HmHrqNg6oA7`. All 19 frontend assets and backend identity
matched. However, journey run 40922764694 stopped before writing: authenticated
Medical capability still reported legacy/disabled mode. The branch-scoped build
pull plus githubCommitRef metadata had not supplied the mode to runtime.

Candidate `9c83f09ea057e42d786c68906b104c627f34a1de` explicitly carries only the
configured non-secret Medical mode from the staging preview env file to CLI
`--env` runtime configuration. Missing/invalid modes fail closed; `legacy` remains
an explicit rollback choice. Three focused runtime-config tests and qa:static
passed. The shared release queue and Full QA gate are retained. Redeploy run
40923651429 is in progress; four-case journey acceptance remains unapproved.

The journey guard now distinguishes the canonical aggregate updatedAt receipt
from clinical record timestamps. All 33 guard tests passed; unrelated clinical
fields and per-record timestamps remain protected. No historical user-data repair,
cache clearance, main integration or production release is part of this step.


## Canonical activation and delayed-receipt finding

Staging deploy 40923651429 passed Full QA and authenticated smoke from
`9c83f09ea057e42d786c68906b104c627f34a1de`, publishing
`dpl_x2QDzbrdQ5fnzC1hm2kV35DVcyoe`. The explicitly passed runtime mode worked.
Journey run 40925880748 passed normal saving, both author/peer Medical and Sessions
views, both reloads, and synthetic cleanup. Lost-response saving committed once
and its retry returned the same event with duplicate=true, but the UI receipt
was absent; two remaining modes did not run. Both test records were independently
confirmed archived. The overall four-case acceptance remains unapproved.

A local regression now reproduces the missing receipt: a delayed generic reply
with the server's updated aggregate timestamp causes a background Medical render
after the canonical confirmation. The renderer used to erase that confirmation.
Only quick-recommendation feedback can now opt into surviving background renders,
using its original generation/account/date/permission guard. The guard is checked
after the read batch; explicit replacement/clear and invalidated guards discard it.
No record, persistence policy, request or permission rule changes in this UI fix.

Validation: 58 API/guard/render contracts, all eight Chromium journeys, all eight
WebKit journeys, npm run check and qa:static passed. The source manifest now
includes the workspace renderer (20 assets). A new guarded staging publication
and the four real acceptance cases are required before approval.


## Cold-reader roster lag regression

The canonical-only local journey was strengthened to begin without a saved
Medical player, matching the staging fixture. It then reproduced a second real
visibility issue: cloneMedicalState filtered a valid canonical record before
ensureMedicalState projected its already-known Squad player into the Medical
roster. A cold second browser consequently showed no accepted recommendation.

Automatic approval review rejected removing the roster filter because unknown
clinical identities could become visible. That proposed broad change was not
executed. The implemented alternative keeps the filter and links only a missing
exact ID to one unique, active profile from the existing Squad-to-Medical read
projection, with a signed-in user and unchanged nonempty read scope. It performs
no write and does not infer identity from names. Unknown, same-name-only,
archived, deleted, duplicate and no-scope identities remain filtered. Coach
sanitization remains in place. No historical records are repaired or replayed.

The focused canonical-only cold-peer journey now passes; 46 state-service
contracts pass including retention only for the exact permitted profile,
unchanged raw storage, no central writes and private/coach sanitization. The
previous staging attempt 40927894482 was cancelled during QA, before deploy,
so both visibility corrections can be verified together. Staging still serves
`dpl_x2QDzbrdQ5fnzC1hm2kV35DVcyoe`; full four-case acceptance is pending.


## Resumed verification of the combined visibility candidate

A standalone WebKit blank-page probe succeeded. A fresh isolated output directory
and sequential browser runs then passed all eight WebKit and all eight Chromium
journeys, including canonical-only saving with an initially empty Medical roster.
The previous interrupted/artifact-collision run is not counted as acceptance.
All 104 focused state/binding/renderer/staging-guard contracts passed, including
no-user and scope-change rejection; npm run qa:static (including syntax) and
git diff --check passed. The release traffic guard found no active release.

The next authorized action is staging publication of this combined candidate,
followed by the four real API acceptance cases. No main integration or production
release is included. These checks do not certify all modules or concurrent writers.


## Real staging revision race — 2026-10-30 UTC

Candidate 37dff4fdaa8b7accd134d735200da48d20533536 passed full QA and
authenticated staging smoke in 40980066422; build dpl_DWYgjfZcsyMYUDQFqcH9YGFAMfmy
matched all 20 reviewed frontend assets. Production remained at 845a0ed95.
Acceptance 40981484076 passed normal saving but stopped in lost-response mode:
canonical commit/retry returned the same event (duplicate=true), while generic
saving returned HTTP 409 and never obtained a receipt. Its cleanup completed
without a reported cleanup error; two subsequent cases did not run.

Inspection found a compare-and-swap collision between the two Medical writes.
The runtime correctly keeps a conflict pending; it does not retry Medical.
System / Security owns the bounded central-sync correction; Medical's server
merge rules and Sessions consuming view remain unchanged. The implemented retry
applies only to the existing database-race response, once, for the same current
scoped generation. It must preserve the ORIGINAL base revision: advancing it
would bypass Medical's stale-write merge and could overwrite concurrent work.
Semantic conflicts, whole-key deletions, recovered generations, changed
identity/access and newer local edits remain protected. No acceptance assertion
is weakened, no historical repair, cache clearance or production release occurs.


The new runtime contract failed before the correction (only one request) and
passed afterwards. All 136 central-sync contracts, ten existing Medical server
merge/version contracts, all nine Chromium journeys, all nine WebKit journeys,
qa:static and diff checks passed. The browser race fixes the observed ordering:
the generic 409 arrives before the dropped canonical response. It asserts the
first retry retains the identical request/base and that pending clears only after
acceptance. Later canonical bookkeeping retains its own local generation.
Temporary local diagnostic instrumentation was removed. The real staging
acceptance assertions and four-case sequence remain unchanged.


## Acceptance ownership stop — 2026-10-30 UTC

Staging 40982982188 passed full QA and authenticated smoke for 6ec55ba5c,
build dpl_ieSWu1JoprE8XxQ6TuZAEkYWfuzH; all 20 assets matched.
Acceptance 40984709466 stopped in normal mode before generic delivery because
the synthetic ownership guard found unrelated Medical content missing from the
proposed payload. Canonical saving succeeded; all subsequent cases were skipped.
Read-only staging inspection found 23 archived records, two without a Medical
player. The latest own test record was confirmed archived.

The existing UI roster filter must remain. A subsequent full-state save must
therefore preserve out-of-roster records/plans in storage without adding them to
the rendered view. The correction is confined to Medical serialization for an
unchanged private read scope; coach sanitization and server write/merge policy
remain unchanged. This protects future saves, not historical repair. No real
user rows are changed by diagnosis, and the acceptance guard remains strict.


Both unlisted-row regressions failed before the serialization correction.
Afterwards all 51 Medical state contracts passed, covering active/archived
unlisted records and plans, unchanged private fields, coach sanitization, read
maintenance and a scope change during source reading. All ten Chromium and
ten WebKit journeys passed, including a new-save fixture containing unlisted
archived records/plans. qa:static and diff checks passed. The correction changes
only future serialization, never the visible state or existing central rows.


## Final staging acceptance — 2026-10-30 UTC

- Product source: `d1e9374df42e0d792ae49a245098df735e6d9821` on
  `codex/medical-recommendation-journey-20261029`; clean local/remote exact SHA.
- Staging deployment: `40985824616` passed all four browser shards, API contracts,
  static/security gates, deployment and authenticated staging smoke.
- Staging build: `dpl_EiWkM8G5aQp2AC5eVxUyjFUzkV2U`; all 20 frontend assets
  match, backend remains `pokrksgempkuraueglpu.supabase.co`.
- Acceptance: `41008796744`, 33 guard contracts, four real journeys and six
  authenticated smoke cases passed. No assertions were removed or relaxed.

| Real case | Canonical path | Generic path | Author/peer Medical + Sessions + fresh reload |
| --- | --- | --- | --- |
| Normal | Accepted once | Actual 409 then accepted 200 | Passed for both |
| Lost response | Commit accepted; same event/key retry duplicate=true | Actual 409 then accepted 200 | Passed for both |
| Generic failed | Accepted | Injected failure; no invented receipt | Passed for both |
| Canonical failed | Both attempts failed; UI retained failure message | Accepted | Passed for both |

Every test completed its guarded archival and temporary-account cleanup.
Independent read-only database verification confirmed all four own records
archived and no active corresponding synthetic player. These record IDs are:
`medical-record-1793338278791-705bfd49ae2fe`,
`medical-record-1793338303831-5f1f352505005`,
`medical-record-1793338327177-e126f0761ffca8`,
`medical-record-1793338349571-0d07ca4fdcdb08`.

Production's public identity remained source
`845a0ed95bbd8795bf574a8aeb0c9f37ed903250` with backend
`bustidorxevacosqhkcz.supabase.co`. This is an unchanged-version/isolation check,
not a production acceptance of this candidate. No historical repair or cache
clearance was performed. Production database compatibility/release review and
explicit production authorization remain separate. Sustained concurrent writers,
real offline restart, disk exhaustion, storage growth, all Medical form variants
and other modules remain outside this bounded staging approval.
