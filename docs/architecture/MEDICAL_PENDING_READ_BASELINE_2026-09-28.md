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

## Persisted Principal Boundary And Owner Return

Review 5341236054 on `bec4fa4c` found that rejecting an old HTTP receipt was
insufficient: its retained manifest entry could be retried by the next account.
New protected writes and queued generations now record their initiating read
scope. Manifest retry, send, journal-stage completion, conflict retry/hydration
and receipt handling check that scope before continuing. Another account gets a
server-only read view; the foreign native value and pending entry are retained,
not merged, seeded or posted. Sessions keeps its existing scoped journal.

The same review found that a completed Medical replacement could be mistaken
for an incomplete replacement after visiting another account. The durable marker
now explicitly marks incomplete replacement; that flag survives only while its
original manifest generation remains. Returning to the acknowledged owner can
refresh its cache without creating an unnecessary recovery archive. Server
refresh may reorder JSON UI keys; all content must remain equal, and the resulting
native bytes remain protected on the next account switch.

Regression evidence includes Schedule/Periodization/Player Profiles manifest
retry after account change and reload, a real Schedule storage/auth/ready/reload
browser chain with a held old-account response, and Medical A-to-B-to-A-to-B
transitions. Two additional negative service tests reproduced account changes
during journal staging and conflict hydration before the continuation guards
were added. These tests keep the original pending generation and raw data intact.

The previous CI failure was a test readiness race after quota-path reload:
the backup facade had not installed yet. The test now waits for that actual
facade before calling it. No timeout, product bypass or safety assertion changed.

This is ownership protection for newly recorded pending generations, not a
migration assigning ownership to all historical unscoped storage. Non-Medical
foreign recovery views remain read-only for a different owner; automatic
recovery/adoption under a new account is intentionally outside this patch. Medical recovery archives remain
durable and require explicit review. Fresh exact-SHA CI/review is still required.

Final local verification: 3,088 tests passed (3,033 API/contracts, 45 central-state
browser cases, 10 Medical clinical cases). The 36 affected risk cases passed ten
repetitions each (360/360). `npm run qa:static` and `git diff --check` passed; the
same 84 existing architecture warnings remain. No timeout or budget was raised.
These are isolated mocked development checks, not authenticated Live verification.

## Returning Pending Owner And Deferred Retry

Review 5341714126 on `fcd375fa` found that a same-page A-to-B-to-A flow retained
B's read-only view even after A returned. A fresh authorized response containing
the key now releases that foreign view and its cached revision, without changing
A's native pending value/entry. An omitted key stays read-only. Medical and the
Sessions journal retain their separate recovery rules. The browser proof checks
that A retries at revision 1, not B's revision 10, receives revision 2, preserves
its event and sends exactly once after returning, both with and without reload.

The real event chain also reproduced a lost retry intent when another write was
already queued/in flight at ready. A manifest retry request now survives those
waits and is scanned once after a successful queue drain. Network failures do
not start a new retry loop; another external retry trigger remains necessary.
Four negative service contracts failed before their corresponding fixes and pass
afterward: a queued timer, an active flush, a new write arriving during the
journal read, and overlapping manifest scans. Each retry request has its own
identity so an older scan cannot consume newer recovery intent. The intent is
consumed only after the journal await and current-account/queue checks.

GitHub QA on `fcd375fa` passed all groups except the existing Sessions save
feedback check. The failure reproduced locally: an authenticated local-dev user
has no server token, so the new scope check suppressed its existing local save
flow. Local development now has a distinct, non-production scope. A real
production context without a token still has no scope and cannot queue central
writes. The original critical-flow test is unchanged and passes with this fix.

The late Medical receipt browser scenario now waits for the real module default
normalization to be acknowledged before holding the next runtime receipt. A
read-only editable view was previously an early readiness signal: its later
normalization could race the test write, correctly cause a 409, and move the
held request into conflict hydration instead of the intended runtime path.
The revision-guarded mock, B's revision 10-to-11 acknowledgement, exact B payload,
and no duplicate B request assertions remain. No timeout or product bypass was
added for this readiness correction.

Verification after the returning-owner/retry fixes: 3,097/3,097 passed (3,041
API/contracts, 46 central-state browser cases, 10 Medical clinical cases).
All 46 affected risk cases passed ten repetitions (460/460), including the
unchanged Sessions save-feedback test from CI. `npm run qa:static` and
`git diff --check` passed with the same 84 existing architecture warnings.
The eight-file scope is unchanged, with no module product files, budgets,
timeouts, server API or migration changes. Fresh exact-SHA CI and review remain
required; these local mocked checks do not establish production verification.

## Review 5342348852: Original Revisions And Returning Owners

`190d22eb` is not approved: review found three additional returning-owner cases.
Its exact-SHA QA also reproduced the unchanged Squad placement test using local
development: changing a local team hid the same user's pending structure cache.

- Retained retries now carry the manifest's original base revision, including
  zero for first creation or unknown history, instead of adopting a fresh bridge
  revision. Queueing persists `pendingBaseRevision` separately from the highest
  acknowledged `serverRevision`; later edits of the same owned pending
  draft keep it. A verified Medical replacement does not inherit another
  generation's base. Missing history cannot authorize overwriting an existing
  central record.
- A retained whole-state conflict cannot promote its revision or treat a
  hydration as an acknowledgement. Repeated identical conflicts remain pending
  without automatic repeat POSTs. This is intentionally not automatic conflict
  resolution: both the colleague's central edit and the local draft survive.
- A GET can now return `absentKeys` for registered missing keys allowed by the
  existing server read policy. Unauthorized and existing keys are not reported
  absent. Batch hydration carries this proof inside its existing scope/token
  boundary. Older servers lacking it remain fail-closed. This closes authorized
  first-creation recovery without interpreting every omitted key as permission.
- A fully persisted Medical replacement belonging to the returning scope can
  release the foreign view. Incomplete replacement markers and foreign owners
  remain separated. Hydration preserves that pending generation rather than
  rewriting/acknowledging it before its real POST succeeds. This special handling
  requires a recovery marker; ordinary Medical read updates continue to apply,
  including the existing view-date/central-recommendation regression.
- Local development uses a distinct user/organization scope that remains stable
  across local team/role configuration. Production scope still requires a token
  and includes organization, club, team and role; the local rule is not used for
  authenticated central production reads.

Negative contracts reproduced original-revision loss, blocked Medical owner
return and ambiguous absence before correction. Real browser coverage now tests
Schedule owner return with and without reload against unchanged, advanced and
absent server records. Advanced records reject the old base without overwriting
central or clearing the draft. Medical covers a failed replacement POST, another
organization/reload, owner return and one acknowledged retry on the original
revision. The original Squad and Sessions feedback tests remain unchanged.

Scope expands from eight to ten files solely for `api/app-state.js` and its
existing database-source API contract file, required for trustworthy absence
proof. No module product source, schema, migration, budget or timeout changes.

### Additional Negative Proofs

The repeated browser run exposed a real false acknowledgement: module default
normalization accepted revision 5, the explicit Medical replacement still sent
base 4 and received 409, then successful conflict hydration cleared its pending
flag without a write receipt. Medical conflict hydration can no longer take the
runtime's legacy read-as-acknowledgement path. A negative service contract
reproduced the false pending clear before the fix; the browser matrix now
explicitly rejects a replacement with 409 while retaining its exact draft.
Successful replacement cases wait for real module readiness and normalization
acknowledgement before the independent write under test, rather than using an
editable read view as a premature readiness signal.

A second negative contract covers older generation-array recovery markers.
The original scoped manifest owner can resume its draft, but a legacy entry
without a principal scope remains separated. Neither raw value nor manifest is
rewritten by this read-view decision. Incomplete replacements still fail closed.

Repeated conflict recovery also retains an explicit issue status instead of
leaving the queued "Saving" status active when no request will be sent. The
same generation is not repeatedly posted; its pending flag remains durable.

The existing stale-recommendation browser test now uses a revision-guarded
Medical mock for every write. Its old generic handler derived response revisions
from the request, allowing a base-0 write to receive revision 1 after revision 5
had already been acknowledged. That impossible backwards acknowledgement no
longer masks the actual server CAS contract. Recommendation/archival content and
aligned-revision assertions remain unchanged.

Final local verification for this review correction: 3,118/3,118 passed
(3,056 API/contracts, 52 central-state browser cases, 10 Medical clinical cases).
All 72 selected risk cases passed ten repetitions each (720/720), including both
unchanged critical-flow checks from prior CI failures. `npm run qa:static` and
`git diff --check` passed; the 84 pre-existing architecture warnings remain.
No budget, timeout or safety gate was relaxed. Fresh exact-SHA GitHub QA,
CodeQL and independent review are still required before release consideration.

## Review 5346156360: Read Failures And Durable Successor Bases

`7d471534` is not approved: independent review found that a failed Storage read
could be mistaken for an absent central key, and an in-flight Schedule receipt
advanced its queued successor only in memory. Both were reproduced in negative
contracts before correction.

- Storage record reads now retain the HTTP error body and distinguish missing
  objects from unavailable/denied reads, missing buckets and invalid records.
  Errors abort GET and write preflight without certifying absence or writing a
  replacement. Database compatibility reads use the same rule; failed bootstrap
  persistence cannot silently omit a known backup record.
- `absentKeys` comes from confirmed source reads/tombstones, then passes through
  the existing authorization filter. Snapshot omission is not absence proof.
  Positive contracts retain authorized missing-object and tombstone behavior.
- An acknowledged Schedule write advances the queued successor's durable
  `pendingBaseRevision` as well as its in-memory base, only when raw content and
  its captured manifest generation/owner still match. A new runtime can replay
  that successor against the acknowledged revision. Newer generations, including
  same-value edits and another owner, do not inherit that revision.
- Exact-SHA CI crossed a date boundary and exposed invalid Medical test data:
  40/80 percent participation, a non-roster player and incomplete historical
  records triggered real module normalization. The fixture now uses the actual
  allowed percentages and canonical record shape. The unchanged ownership,
  pending, receipt and raw-value assertions run both on the record date and the
  following day. No Medical product behavior or timeout changed.

Local verification: 3,145/3,145 passed (3,078 API/contracts, 57 central-state
browser cases and 10 Medical clinical cases). The 32 selected cases passed ten
repetitions (320/320); successor generation checks were repeated again after
strengthening the equal-content/equal-hash case. `qa:static` and diff checks
passed with the same existing architecture warnings. Fresh exact-SHA GitHub
QA, CodeQL and independent review remain required; there was no deployment.

## Review 5346441699: Stale Reads And Failed Cache Persistence

The exact-SHA QA and CodeQL checks for `e3c79f9b` passed, but independent review
found three further cases. All three were reproduced before the corrections:
five negative test variants failed against the reviewed product code.

- Every hydration batch now passes its captured scope/token predicate into
  `apiRequest`, including the empty-store seed request. An obsolete 401 cannot
  sign out the refreshed session before hydration discards the stale response.
  Browser tests cover both same-organization rotation and organization change,
  through the real auth event chain, with old 200 and old 401 responses.
- Schedule successor base advancement now reads back the durable manifest,
  rather than trusting the mutation callback's attempted result. This requires
  one additional facade dependency: the existing data-safety `readManifest`.
  An unverified advance pauses that successor without posting it at either an
  unverified new base or a known obsolete base. An external retry can persist
  the receipt and drain once; newer same-value generations and other owners
  cannot inherit it. The service harness now models detached manifest reads
  and swallowed persistence failure, as the actual storage service does.
- A returning acknowledged Medical owner's verified server projection remains
  available as an explicitly non-durable, server-backed view when cache quota
  prevents replacement. The previous disk copy is retained. No pending write or
  recovery archive is created by this read, and non-quota failures restore the
  previous separated view before failing. Tests run on both sides of the date
  boundary and assert the newer clinical note, revision, native copy and no POST.

If storage remains unavailable and the tab closes before the successor receipt
can persist, its local draft and original base survive. Recovery still uses CAS
and retains a conflict rather than silently borrowing a newer server revision.
This is a fail-closed storage limitation, not a claim of successful offline save.

Final local verification: 3,153/3,153 passed (3,082 API/contracts, 61 central-state
browser cases and 10 Medical clinical cases); 12 selected risks repeated ten
times passed 120/120. `qa:static` and diff checks passed with the same 84 existing
architecture warnings. The old batch source assertion was strengthened to
require propagation of the initiating predicate, not removed. Scope is twelve
files relative to main, adding only the one-line facade dependency and the
existing API batch-contract assertion to the previous ten-file scope. No module
product code, budgets, timeouts, migrations or Live data changed. New exact-SHA
CI and independent review remain required.

## Review 5346700666: Recovery Failure, Empty Baselines And Token Rotation

The previous candidate passed exact-SHA QA and CodeQL, but independent review
identified four additional cases. Five negative regression variants reproduced
them before product corrections. No production data was read or modified.

- **Medical marker failure:** install the authorized read view with editing
  disabled before persisting its recovery marker. Retain a runtime separation
  marker on persistence failure. Read-only actors cannot fall back to a pending
  clinical draft even before hydration or after reload. The native draft and
  manifest remain intact. The browser regression injects a real Storage-layer
  marker failure, reloads with that failure still active, evicts the view and
  finally verifies recovery without a Medical POST or pending acknowledgement.
- **Persisted absence evidence:** serialize explicitly confirmed `absentKeys`
  in the existing read snapshot and validate them when another API instance
  loads it. Unknown, duplicate and contradictory keys are excluded; malformed
  existing entries cannot become absence evidence. Snapshot omission still
  proves nothing. The contract exercises a real snapshot write/read round trip
  through separate handler instances.
- **Fully empty server:** pending generations are excluded from legacy batch
  seeding. Their ordinary queue owns the revision-bound write and receipt.
  Owner-return tests cover same-page and reload with a completely empty read,
  asserting exactly one new base-zero write, revision one and cleared pending.
- **Token rotation during a write:** continue rejecting the obsolete response,
  including its 401 side effects, but schedule a fresh read after that request
  settles if the same principal remains active. The read can acknowledge shared
  Schedule equality despite object-key order or local view preferences; real
  shared changes remain pending. Tests rotate the token through the real auth
  event chain, read the pre-commit revision, release the POST, then require a
  new-token post-commit read without a duplicate POST. A newer local edit is
  separately proven not to inherit that acknowledgement.

The source-extraction harness now supplies the same manifest-read dependency
and runtime marker initialization used by the production bootstrap. No timeout,
budget, permission or safety assertion was relaxed. Fresh exact-SHA CI and
independent review remain required before release consideration.

Local verification for review 5346700666: 3,159/3,159 passed (3,083 API/contracts,
66 central-state browser cases and 10 Medical clinical cases). Twelve selected
risks passed ten repetitions each (120/120), including the strengthened durable
Schedule revision assertion. `qa:static` and `git diff --check` passed with the
same 84 existing architecture warnings. This correction changes six files
inside the unchanged twelve-file PR scope. No merge or deploy was performed.

## Remaining Platform Work

Partial batch-failure isolation, freshness diagnostics, cross-device offline
journals and additional module integrations are separate steps. No production
data was inspected or changed for this fix. Deployment requires a new explicit
user command and the normal Safe Lane.
