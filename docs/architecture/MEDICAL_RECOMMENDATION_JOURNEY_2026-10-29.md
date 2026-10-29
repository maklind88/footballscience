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
