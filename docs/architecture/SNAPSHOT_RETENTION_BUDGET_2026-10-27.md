# Protected snapshot retention and bounded admission

Task/release owner: System / Security. Affected boundaries: shared browser safety
snapshots; Sessions owns its recovery prefix and operation rows; Medical owns its
clinical writes and recovery rules; Library owns its records and retained copies.
This candidate changes no module journal, central API, permission or merge rule.
Shared file restore now rechecks the existing write permission contract.
No historical user data has been inspected, repaired, cleaned or exported by this
implementation. Fixtures and timings below are synthetic.

## Problem and decision

The previous writer appended a complete envelope to history and another complete
copy to `latest`, then pruned in a separate transaction using key order and a count
of 30. Only the dedicated Sessions recovery prefix was excluded. Ordinary rows
could contain pending or unknown recovery state. A quota failure during insertion
could prevent the later cleanup from running; a more aggressive pre-cleanup would
instead risk deleting the only retained work before its replacement committed.

Keep the full v1 envelope. Write future browser snapshots to the separate
`football-science-browser-snapshots-v2` database (schema version 1). Keep the
legacy `football-science-data-safety-v1` database and Sessions journal connection
unchanged. Do not migrate, copy, clean or remove existing history. Use one read/write
transaction for inspecting eligibility, retiring replaceable history and writing
both new copies. Success requires transaction completion. Any synchronous failure,
request error, budget refusal or transaction abort leaves previous rows intact.
This does not guarantee that the browser can reclaim physical space inside a
transaction: an actual quota failure must still roll back safely.

## Admission policy

- At most 30 ordinary history rows and 64 MiB of serialized UTF-16 JSON across
  that history plus the single `latest` cache row. These are application limits,
  not physical disk usage, free quota or a hard memory bound. The 64 MiB ceiling
  is an initial engineering policy, configurable by the service, not a measured
  universal browser capacity.
- A row is eligible for ordinary rotation only with the known v1 shape, matching
  nonempty owner scope, empty recovery state/copies/separations, explicit nonpending
  metadata and positive central revisions for every entry. Every stored value must
  have matching manifest metadata. The legacy short hash is a consistency veto,
  not an independent central receipt or permission to retire pending work.
- Unknown fields/shapes, missing acknowledgements, prepared writes, other scopes,
  pending entries and recovery payloads are protected from ordinary rotation. No
  age-based expiry exists. A replacement may retire an old row only when it carries
  the protected values and metadata exactly, or retains the exact payload with an
  accepted receipt for that same generation. Generation identity includes scope,
  write counter, timestamp, hash, pending base revision and deletion intent; the
  accepted revision must advance beyond the pending base. A hash alone is never
  acceptance. Missing raw data requires explicit deletion intent for that transition.
- Recovery payloads/separations require preservation of their entire prior storage
  and metadata context. We do not infer which surrounding fields they depend on.
  Standalone pruning cannot use replacement proof because it commits no new copy.
- Dedicated Sessions recovery rows are skipped without reading their payloads.
  Sessions rows in `latest` and other stores are untouched and outside this budget.
- The new history row cannot be retired to make its own admission appear successful.
  An individually oversized copy is refused. Unknown existing data exceeding the
  budget is retained; additional copies are refused rather than silently deleted.
- An identical consecutive snapshot with a matching history row creates no data
  and can succeed even if existing history is already above budget. Unknown extra
  recovery fields participate in comparison, so a changed future field is retained.
- If the previous `latest` cache has lost its matching history row and differs from
  the incoming payload, preserve it as a protected orphan in the same transaction.
- Identity collisions fail closed. The scan retains descriptors rather than every
  payload and stops after 4096 examined keys; that refusal also commits nothing.

The standalone pruning API uses the same policy, keeps the current latest backing
row, and refuses without deletion when protected rows prevent compliance.

## Restore boundary

Import previously continued after `saveSnapshot("before-restore")` returned false.
It now stops before any restoration writes, central queueing, import success marker
or reload. Existing recovery review and authorization checks remain in place.
This does not newly certify concurrent multi-tab restore or the entire restore flow.

## Receipt capture and user-visible pause

The central runtime optionally captures a snapshot immediately after its existing
verified receipt has durably updated the manifest, before later UI callbacks can
create a successor edit. Exact read acknowledgements use the same hook. Capture
failure, rejection or noncompletion cannot reject a central save. Identical
in-flight copies share one commit result before hashing the summary or scheduling
a database transaction. Equality compares the actual values, scope, generation and
recovery metadata; it does not rely on a short hash. Different versions never join. Server requests,
permissions, conflict handling and acknowledgement eligibility are unchanged.
Capturing a snapshot still copies the full envelope; this is not a delta journal.

Storage health distinguishes available, paused, failed and unknown browser snapshot
outcomes, scoped to the current account/team and internally cross-checked. The
follow-up stores these diagnostics in one dedicated `:snapshot-status` localStorage
record. Snapshot completion no longer rewrites the primary pending-save manifest.
Legacy snapshot fields remain untouched and are not treated as fresh diagnostics. It explicitly separates snapshot status from module/central save
status. Failed or paused copies offer a retry without clearing data or resolving
conflicts. Account changes block retry/status publication; stale results do not
replace a newer attempt's diagnostic. After retry the inventory asks to reopen for
fresh measurements rather than claiming that no data changed.

## Old-client and rollback boundary

The separate snapshot database prevents already-open old writers and rollback
writers from pruning future copies. The legacy `openDatabase` connection continues
to serve Sessions recovery unchanged; `openSnapshotDatabase` owns the new copies.
Diagnostics inventory both databases without exposing payloads. A frozen writer
from main commit `845a0ed95bbd8795bf574a8aeb0c9f37ed903250` exercises actual old
write/prune behavior in another tab and in a fresh rollback tab. Tests prove old
pruning ran, legacy Sessions pending/fallback rows remained, and the new protected
copy survived that pruning and reload.

This is isolation of future snapshot retention, not certification of every old
client's saving behavior. Old UI does not discover the new snapshot database.
Legacy history remains governed by any old client still writing there. Both
locations share the browser's origin quota; separation creates no extra capacity.
No forced reload may discard volatile or offline work.

## Verification and release boundary

Tests cover count and serialized-byte admission, pending/unknown/foreign/recovery
protection, future fields, exact generation versus wrong generation acceptance,
latest-without-history preservation, duplicate identity refusal, competing writers,
unchanged Sessions rows, atomic rollback after quota/request/put failure, repeated
editing and reload, deduplication, database compatibility, snapshot/save-status
separation, and restore refusal when its protective snapshot cannot commit.

The repeated-receipt fixture wires the real central runtime to the real snapshot
service: twelve pending-to-accepted generations remain within one history slot.
Another fixture retains unchanged pending work across 25 acknowledged changes.
Pause/retry is exercised through the actual Storage health dialog, including a
wrong-generation refusal and account transition. These are synthetic local tests,
not authenticated staging or production acceptance.

The initial old-writer regression failed nine of ten cases; its abort protection
passed. The earlier candidate `37598bfcc4998178cee27352219e73cece3f22b7` passed 181
local targeted cases and the full GitHub QA/CodeQL workflow. This follow-up passed
414 targeted cases: 232 API contracts, 91 Chromium and 91 WebKit cases.
`npm run qa:static` (including syntax, storage/security and architecture guards)
and `git diff --check` also passed. Full GitHub CI for the follow-up commit remains
a separate check. A previous synthetic 30 MiB replacement
observation was approximately 94 ms in Chromium and 71 ms in WebKit; these single
observations are not production latency guarantees or an overhead budget for
receipt-driven capture.

This candidate follows storage-growth PR #290. It does not bundle PR #291's
independent bounded diagnostic scans; integration must retain those scan limits
alongside the new database inventory. The save-status scope correction in PR #289
also remains a separate candidate. No staging/main/production release has started.
Direct user release authorization and Safe Lane validation are required.

## Remaining obligations / critique

This is containment, not the complete storage solution. Distinct unresolved
protected generations can still fill the budget and pause optional snapshots.
Exact replacement cannot replace owner-specific review or safely discard a
conflict. Historical pending generations with no exact receipt remain protected.
Recovery review/export accessibility, receipt-capture overhead under sustained
load, browser eviction, physical quota/localStorage exhaustion, full-envelope
amplification and cross-tab diagnostic freshness still need separate acceptance.
Adding a database does not reduce existing disk usage.

The primary journals, memory-only drafts, central read visibility, distinct-user
conflict handling and all-module acceptance remain separate obligations. No cache
clearing or historical review resolution is part of this candidate. The live
device report remains local and is not published here. No platform completion
percentage follows from this scoped evidence.


## Follow-up: pressure, concurrency and CI startup (28 October 2026)

The original failed PostgreSQL job (40612401263) failed in the initial process
startup before the paged-backup assertions. Added bounded process diagnostics keep
stderr/SQL/data private while distinguishing spawn, stdin, output-budget, timeout
and exit failures. The diagnostic job (40614066659) reproduced EPIPE on a quick
synthetic command with empty stdin. Commands without input now use an ignored
stdin descriptor; SQL and held snapshot connections retain their pipe and fail
on undelivered input. PostgreSQL job 40614304246 passed after this change. This
fix changes process plumbing, not SQL, schema, permissions or backup policy.

The initial two pressure/concurrency tests failed because snapshot completion
rewrote the primary manifest. Snapshot diagnostics now use a separate single
record, avoiding that particular read/modify/write race with module pending
metadata. Two real browser tabs and a 20-call / 2 MiB burst assert zero snapshot
writes to that manifest. This does not certify atomicity of all other manifest
writers or cross-tab freshness of advisory snapshot diagnostics.

Before coalescing, a synthetic 20-call identical burst blocked capture for roughly
53–150 ms in local observations and scheduled redundant transactions. After
coalescing, one observed Chromium run captured in about 6 ms and finished in about
15 ms, with one transaction and one history row. These are synthetic observations,
not an SLO or proof about phones. All 20 callers still read current native values
for exact comparison; different incoming generations are not bounded by this
coalescing optimization. Tests reject sharing across payload/generation/scope
changes and require all joined callers to receive failure on a quota fault, with
a later retry able to succeed.

The Sessions restart/replay scenario now also runs with the snapshot budget
already blocked by two distinct unresolved versions. New Sessions work commits
offline, survives a fully closed browser profile, stays invisible to another
scope, and replays once on reconnect. Both old protected work and current work
remain present. This proves the primary journal can recover independently of a
paused optional snapshot; it does not certify a user-facing browser-snapshot
selection/export/import flow under physical quota exhaustion.

Release remains blocked on final candidate validation and the outstanding
acceptance work. The original failing test is not waived. All-module acceptance,
a bounded strategy for many distinct rapid versions, advisory diagnostics under
cross-tab races, physical quota, and the retained-copy recovery UI remain open.


Final local follow-up validation: 529 targeted Playwright cases passed (233 API,
148 Chromium, 148 WebKit), plus `qa:static` and `git diff --check`. The process
wrapper also runs 22 native Node checks as part of the API guard. WebKit's synthetic
20-call / 2 MiB duplicate burst recorded one transaction, roughly 6 ms synchronous
capture and 11 ms total on this machine. Raw protected content is never logged.
The final combined commit still needs its own GitHub CI results.

| Acceptance boundary | Current evidence | Still required |
| --- | --- | --- |
| PostgreSQL tool startup and real backup contracts | Synthetic process regression and GitHub job 40614304246 pass | Final combined SHA CI |
| Snapshot completion versus pending module metadata | Zero primary-manifest writes in burst and two-tab tests | Other primary manifest writers are outside this correction |
| Identical concurrent capture | One transaction; exact equality; shared success/failure; different generations stay distinct | Sustained distinct-version load and resource bounds |
| Sessions recovery with full snapshot history | Offline commit, full browser restart, scoped replay exactly once; originals retained, Chromium/WebKit | Physical-device quota acceptance and snapshot-selection UI |
| Medical regression boundary | Working drafts, draft verification/recovery and central visibility under cache faults pass, Chromium/WebKit, synthetic server fixtures | Authenticated release acceptance for the exact combined build |
| Whole platform | No new blanket certification | Module-by-module acceptance remains open |


## Follow-up: distinct bursts and restore boundaries (28 October 2026)

All GitHub checks for predecessor `e083f4be63ab95119ce3d8e4d09e14be2bcb2af5`
passed, including real PostgreSQL backup contracts, API/static checks, all browser
shards and CodeQL. This closes that predecessor's final-CI obligation; it does not
stand in for CI on this new candidate.

### Bounded active copying

The previous exact-duplicate optimization admitted every different generation.
The service now admits at most four distinct active captures and 64 MiB of their
serialized UTF-16 envelopes per service/tab. Exact duplicates join an admitted
write even when capacity is full. The count check precedes hashing/serialization.
The byte and count limits are configurable engineering containment policies, not
measured universal browser limits. The history budget is separate.

A refused attempt returns false, publishes a scoped `busy` outcome, and retains no
queued full envelope. It does not reject primary module saving or assert that the
refused generation was captured. When active captures finish, one debounced attempt
captures the then-current work. That refresh rechecks account/team scope when
scheduled and again when its timer runs or pagehide flushes it. A single envelope
larger than the byte limit pauses without an automatic retry loop. Restores are
never automatically retried. Manual retry also reports refusal honestly.

There is still one transient incoming capture before admission, native reads for
exact comparison, serialized-string allocation for the byte estimate, IndexedDB
cloning, and transaction scan cost. This is not a hard JavaScript RAM, CPU, whole
origin, or multi-tab resource bound. A protected generation whose exact acceptance
receipt was not captured stays protected; later success cannot retroactively
justify removing it. Sustained primary editing does not promise that every
intermediate optional snapshot will exist.

The four initial pressure cases failed against the unbounded writer. New tests
cover a 20-distinct-version burst (four committed, sixteen explicitly refused),
one fresh capture of the latest version, byte admission below the count ceiling,
no oversize retry loop, duplicate joining at capacity, scope transitions before
and after drain, pagehide flush, and the visible busy/retry message. Primary pending
metadata and the latest local content remain unchanged by these captures.

### Restore boundaries

Seven injected races/ownership cases reproduced unsafe writes before the fix.
The shared import flow now pins the account/team from before file reading,
rejects an explicitly different source scope or entry owner, and rechecks existing
write permissions before confirmation and after awaited steps. A bridge exposing
no active scope is denied. A changed full protected payload or generation/recovery
metadata while the protective snapshot commits aborts restore before any import
write, central enqueue, import marker or reload. A successful unchanged authorized
restore still takes a committed before-copy and an after-copy.

These checks cover async boundaries, not a cross-tab compare-and-swap transaction.
Legacy files without ownership metadata retain their existing compatibility path;
they do not gain verified provenance. Multi-key localStorage import can still fail
partway and central publication is not atomic across modules. Physical quota,
partial-import recovery UX, authenticated end-to-end release acceptance and a
scope-safe retained-snapshot selection/export flow remain open. No historical work
was repaired or replayed; no browser data was cleared.

Task/release owner remains System / Security, with Medical and Sessions retaining
their module rules. Changes remain on the isolated draft candidate; no main,
staging or production release is included.


Local validation for this increment: 565 distinct targeted Playwright cases passed
across API (233), Chromium (166) and WebKit (166). The initial combined run passed
396; the final edge additions and restore contracts passed in an 84-case rerun,
with the complete 18 new browser cases also checked on their final content.
`qa:static` and `git diff --check` passed. These local counts do not include a
claim of authenticated production acceptance. Fresh GitHub CI for the final SHA
is tracked on draft PR #292.
