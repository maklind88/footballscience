# Medical recommendation to Sessions: evidence and one feedback correction

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
