# Medical Pending Read Baseline

Owner: System / Security / Release (shared cache and hydration contract).
Consumers: Medical, Squad, Sessions. Their clinical rules, rendering, permissions,
server API and database schemas are unchanged.

## Reproduced Failure

A coach with read-only Medical access and a pending Medical disk snapshot could
successfully fetch revision 4 while still reading the old local snapshot.
Hydration advanced its metadata, but returned before applying the central value.
The regression first failed with an empty record list despite a central 75%
recommendation. All test data is synthetic.

## Contract

- Successful authorized Medical reads use an in-memory `central-readonly-baseline`
  when a pending snapshot cannot safely be written by the actor.
- Only local selection fields are carried into that view. Local clinical fields,
  plans, recommendations and media are not merged into the authorized response.
- The original native storage value and its manifest generation remain intact.
  A read is not a save acknowledgement. Backup/export still reads that original.
- Normal module reads use the view. Internal coach view normalization changes only
  the in-memory view; it does not claim local durability.
- Protected writes by read-only actors, remove and clear refuse to destroy this
  recovery copy. The read view cannot enter retry, direct queueing or empty-server
  seeding. A fresh authorized read can enable new writes after hydration finishes.
- Previously queued/in-flight responses cannot acknowledge the separated draft.
- The view is bound to the current actor/organization (when present)/club/team/role.
  Scope changes and sign-out do not expose the old view or fall back to the draft.
  Hydration checks its initiating context after asynchronous reads/projection.
- Older verified revisions cannot regress this view. Missing revision evidence
  fails the read. A successful snapshot omitting the key clears the visible view,
  not the recoverable draft.
- A role change alone does not adopt the separated recovery copy as a new edit.
  Before a new authorized write replaces it, the native value and manifest entry
  are archived in a unique durable `football-data-safety-v1:recovery:` record and
  read back for verification. Failure stops the new write. Copies are exported
  under `recoveryCopies`, survive reload, never enter automatic sync/seed, and
  block blanket clear. Their ownership remains explicitly unverified; they are
  not automatically restored under a different actor. This is not a Medical
  journal or new recovery UI. Existing Medical roster/schema normalization can
  create a fresh server-derived write, but cannot adopt the old private draft.

## Verification

The browser regression covers initial read, the real Medical state reader's
participation value, reload, exact recovery payload/generation, a newer revision,
a delayed older revision, missing revision evidence, omitted/empty snapshots,
no Medical POST/seed, and sign-out. A deferred-read regression covers sign-out
between request and response.

Storage contracts cover quota-safe view normalization, original backup content,
write/remove/clear rejection without partial mutation, and unchanged queue state.
Sync contracts cover automatic retry after an access change plus an older
in-flight 200, 403, 409 and network failure after the view is installed.

Existing central-state, Medical editor, Sessions journal, storage, API and module
contracts remain required. This is not proof that every reported production
visibility issue has the same cause.

Initial candidate verification: 3,020 passing tests (2,976 API/contracts,
34 central-state browser cases, 10 Medical clinical browser cases).
Both new browser regressions also passed 10 repetitions each (20/20) on the
initial candidate.
`npm run qa:static` passed, including syntax, release rules, incident-readiness,
storage, input-save policy, platform security, migration checks and size budgets.
Existing architecture/performance warnings and missing local deployment/QA
credentials remain; these development checks do not authorize or certify Live.

## PR Review Follow-Up

Review reproduced a conflict-path gap: after a 409, successful hydration could
install the read-only view, yet the flush continuation still changed the draft's
manifest revision and cleared pending without a write acknowledgement. The flush
now checks the separated view after conflict retry and hydration, before any
acknowledgement or manifest mutation. Two service regressions cover these paths.

Three additional regressions reproduced stale hydration completion after
sign-out during apply, empty-snapshot client initialization, or the seed response.
Hydration now revalidates its read context at those continuation boundaries and
before successful completion/error publication. Required recovery writeback also
revalidates before continuing hydration bookkeeping.

The follow-up code passed 3,025 tests (2,981 API/contracts, 34 central-state
browser cases and 10 Medical clinical browser cases) and `npm run qa:static`.
Seven targeted regression cases passed ten repetitions each (70/70).

### Automated Review Corrections

The automated GitHub review of f73b0353 identified three additional P1 findings.
The follow-up addresses them as follows; fresh exact-commit CI/review is required:

- Backup import now rejects an affected import before mutation and rechecks after
  confirmation/snapshot awaits. Backups containing recovery archives require
  explicit review; the importer does not silently ignore/adopt those records or
  report a volatile restoration as success.
- Fresh authorized Medical hydration enables new edits only in the matching scope
  after hydration terminates. The first new write archives the old recovery copy
  before normal persistence. Browser tests exercise role promotion and a new
  actor, revision-guarded normal writes, no old-draft adoption and archive reload.
- Concurrent hydration callers coalesce into one scoped fresh request after the
  active read finishes. Token-rotated responses remain rejected. Timer execution
  revalidates scope/token, and does not loop without another request/context
  change. Contracts cover coalescing and sign-out; the browser test uses the
  real auth callback/post-auth hydration chain with deferred HTTP responses.

Backup rejection, quota-failed archival and unauthorized writes are fail-closed.
Recovery archives are intentionally retained until an explicit reviewed recovery
process; automatic archive import/cleanup is not part of this change.

Repeated browser runs also reproduced an earlier boot boundary: the Home Medical
reader can normalize storage before the authorized server view has been installed.
The shared raw storage path now rejects replacing a pending Medical draft when
write authority is absent, including during that initial read. The raw value and
manifest remain unchanged until a verified view or authorized operation exists.
The Medical module's normalization and clinical code are not changed.

Final local verification of these corrections: 3,036 tests passed (2,989
API/contracts, 37 central-state browser cases, 10 Medical clinical browser cases).
The boot-preservation contract and all three new browser cases passed ten
repetitions each (40/40). `npm run qa:static` and `git diff --check` passed without
budget changes. Temporary write-stack diagnostics were removed. GitHub checks
and a fresh review of the new commit remain separate from these local results.

## Reload And Organization Review Closure

Review of `615e669d` identified six further boundary cases. The corrections keep
the same eight-file scope and do not modify Medical business logic or server APIs.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Separation lost on reload before a new actor edits | A small durable marker identifies the exact pending hash/write/time/delete generation. A new runtime hides that generation until a fresh authorized view exists. The manifest and raw draft are not rewritten by marking. | New-runtime contract, quota failure, actual browser reload as a new Medical actor, exact recovery export and no old-draft POST |
| Queued forceApply lost | Coalescing retains forceApply within the same principal scope, but never carries it into another scope. | Deferred-read contracts for same scope and changed organization |
| Organization omitted from normalized user | Preserve canonical profile/app_metadata organization identifiers; never use user_metadata. Refreshed session organization participates immediately in the read scope. | Spoof-negative normalization contract and real auth-event/browser test with an old read held in flight |
| JSON-null backup throws | Optional envelope access reaches the existing invalid-backup feedback. | Null import resolves with feedback and no mutation |
| Backup partial restore before Medical rejects | Preflight uses the same pending/authority rule as raw storage, including before a read view exists. | Schedule-first multi-key import leaves all raw entries and the queue unchanged |
| Authorized creation blocked by omitted Medical | A verified omission can enable a new write in the current authorized scope, while the original draft still requires archival. | New actor receives an omitted key, creates a record, acknowledges it and reloads with the exact old copy retained |

Exports also carry `recoverySeparations` so an unedited separated recovery cannot
silently lose its classification through backup import. Such imports require
explicit review, just like archived recovery copies. The marker contains no
clinical payload or credentials. It is not a distributed write lock or a new
offline journal; a different, newly recorded generation does not match it.

Local verification of the six corrections: 3,047 passing tests (2,997
API/contracts, 40 central-state browser cases and 10 Medical clinical cases).
The six token/organization/access/reload/omission browser cases also passed ten
repetitions each on final code (60/60).
`npm run qa:static` and `git diff --check` passed. No safety thresholds, test
timeouts or architecture budgets were increased. Exact-commit GitHub checks and
independent review remain required before any release decision.

## Coalesced Read And Replacement Ownership Closure

Exact-commit QA for `bd2e73e4` caught a startup-order regression: installing the
recovery marker could hide local UI preferences before the view copied them.
Hydration now copies only the two whitelisted UI fields from native storage and
overlays current view preferences, never clinical recovery data. The browser
contract checks selected date after reload and explicit cache eviction as well
as unchanged raw recovery, manifest and server-only recommendations.

The review of the same commit added four findings:

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Coalesced hydration reports stale success | Every queued caller awaits the actual fresh run; changed scope/token callers resolve false. | Deferred read barriers prove no early success on an already-hydrated page, including failure and sign-out |
| Replacement pending edit loses ownership on reload | Before native replacement, the durable recovery marker also records its authorized read scope. A mismatched actor/organization cannot expose, merge, seed or retry that pending generation. | New-runtime/current-runtime contract and browser test with failed save, organization switch, reload and HTTP token-bound request inspection |
| Blanket clear drops a pending Medical tombstone | Clear inspects pending Medical metadata/read separation independently of native value keys. | Null-native-value tests with and without an installed read view retain the exact manifest and marker |
| Failed native replacement leaves unused archives | Failed writes clean up only their own unused archive/marker when the original raw generation still matches. A newer generation retains its recovery evidence. | Repeated quota failures for value and owner marker; an interleaved newer generation is not overwritten or cleaned up |

Only unused archives from rejected writes are cleaned automatically. Archives
that protected an actual replacement still require explicit recovery review.
No module business logic, server API, database or live data is changed.

Local verification of this follow-up: 3,055 passing tests (3,004 API/contracts,
41 central-state browser cases, 10 Medical clinical cases). Eight critical browser
cases passed ten repetitions each (80/80). After additionally retaining the
recorded owner through subsequent separated reads, the full 3,055 suite and the
two affected reload/ownership cases repeated ten times each passed (20/20).
The request audit uses the actual Authorization header, not a mutable future
profile, to distinguish a late old-account request from a new-account request.
`npm run qa:static` and `git diff --check` passed on the final changes; the same
84 pre-existing architecture warnings remain, with no budgets or timeouts raised.
Fresh exact-commit CI/review remains required; `bd2e73e4` is not release evidence.

## Persisted Replacement And Acknowledged Ownership

Exact-SHA QA and CodeQL passed for `3d21da44`, but review identified two further
P1 boundaries. That commit is not the final release candidate.

- The first replacement now records pending intent with its new manifest
  generation and verifies the persisted entry before queueing or reporting local
  success. If that manifest alone cannot persist, the setter throws an explicit
  recovery error, queues nothing and keeps the old archive plus the new raw value.
  It does not perform a raw rollback that could overwrite a newer edit.
- An owner mismatch protects the native copy even after its acknowledgement.
  A fresh read for the next account remains a separated authoritative view; its
  first new edit archives the old copy and rebinds ownership before pending
  persistence. The stale owner cannot poison that next account's valid write.
  The original owner is retained through intervening separated reads.

Contracts reproduce the manifest-only quota failure and both pending/acknowledged
ownership transitions. Browser tests use real 200/CAS or failed-write responses,
reload under a new organization, verify server-only records, perform a new valid
write and reject any old-organization payload in that account's requests.
An acknowledged value may reorder JSON fields during UI preference preservation;
the test checks content equality there, then protects the captured recovery bytes
exactly across the account transition.

Final local verification for these two boundaries: 3,058 passing tests (3,006
API/contracts, 42 central-state browser cases, 10 Medical clinical cases). The
four latest risk cases passed ten repetitions each (40/40). `npm run qa:static`
and `git diff --check` passed; the 84 existing architecture warnings are
unchanged. No test timeout or architecture budget was raised. Fresh exact-SHA
CI and review are still required; no merge or deployment is authorized here.

## Late Receipts And Recovery Export

Exact-SHA QA and CodeQL passed on `2235a955`, but review 5340719173 found three
additional boundaries. That version is not approved for release.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Old-account receipt accepted after a new explicit edit replaced the read view | Capture initiating principal scope and token, revalidate after awaits and before response/error mutation; sync runtime discards stale-context results instead of retrying or acknowledging them | Nine deferred receipt/error contracts, initial/retry service contracts, and an actual browser account switch with A in flight and B queued; B sends once with its own base revision |
| Manifest-only quota after replacing an acknowledged copy loses separation on reload | A matching replacement marker retains separation until the manifest advances to the replacement generation, even if the old entry was already acknowledged | Pending and acknowledged quota contracts, new-runtime projection contract, and real browser reload retaining byte-exact replacement B plus archived A |
| Backup misses a pending deletion with no native value | Classify protected keys independently of collected values; export raw value/null, manifest entry and marker as recovery state; reject automatic import | Pending tombstone export/import contracts with and without an installed read view and another restorable key |

The new browser quota case uses the actual normalized Medical schema so the
first replacement is the explicit edit under test, not an earlier legitimate
roster normalization. The receipt test uses revision-guarded mock writes and the
real storage/queue/auth-event chain. No raw rollback, permission relaxation or
Live operation is introduced.

The same request-current guard is passed into the existing API helper and checked
after response/body awaits, before its 401 sign-out. Six deterministic barriers
cover token acquisition, fetch and body parsing for both success and 401, proving
that an obsolete response neither escapes nor signs out the new account. The
existing Sessions account/team-change message remains unchanged. Browser setup
accepts either the separated read view or an acknowledged schema-normalization
write before starting the held request; it does not require one boot ordering.

Final verification: 3,081 tests passed (3,027 API/contracts, 44 central-state
browser cases, 10 Medical clinical cases). The 29 affected risk cases passed
ten repetitions each (290/290). `npm run qa:static` and `git diff --check` passed;
the same 84 pre-existing architecture warnings remain. The initial full run
caught the Sessions message mismatch and an over-specific boot-state fixture;
both were corrected without weakening the safety assertions. No budgets or
timeouts changed. Exact-SHA CI/review must be rerun before release.

## Remaining Platform Work

Partial batch-failure isolation, freshness diagnostics, cross-device offline
journals and additional module integrations are separate steps. No production
data was inspected or changed for this fix. Deployment requires a new explicit
user command and the normal Safe Lane.
