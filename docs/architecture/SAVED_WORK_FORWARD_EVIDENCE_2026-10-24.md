# Saved work: observed storage and forward-flow evidence, 24 October 2026

Task/release owner: System / Security, shared storage diagnostics and persistence
acceptance. Affected owners: Sessions (session/block semantics), Exercise Library
(exercise records and retained library copies), Medical (clinical writes and
recovery). This candidate changes no module write protocol, permission, API,
database schema, retention rule or recovery decision.

Governance: distributed-specialist-v4 and ENGINEERING_OPERATING_SYSTEM.md.
Isolated branch: `codex/saved-work-evidence-20261024`.
Base: `0fe90d8bb1abe1ea8face16f4067d087ea9e3980` from fetched origin/main.
The root checkout has unrelated specialist changes and was not edited. Previous
Home/shell candidates remain separate; none is bundled into this branch.
The user authorized proceeding with diagnosis and verification, not deployment.

## Observed on the existing user's browser

Read the existing Storage health UI on footballscience.xyz. No reload, cache
clear, restore, review resolution, data export or content edit was performed.
The visible URL build parameter matched the base SHA; this is not an independent
verification of every loaded asset. Values below are one observation, not a
trend, a physical disk measurement or a certificate of central saving.

| Signal | Observed value | Interpretation |
| --- | --- | --- |
| localStorage | Approx. 8.12 MiB, 34 entries | UTF-16 serialized estimate, not remaining quota |
| Legacy Library and backup | 2.53 MiB each; matching payloads, 49 exercises each | Duplicated legacy payload; matching is not permission to delete |
| Player Profiles | 1.38 MiB | Next largest named localStorage group |
| Safety/Sessions IndexedDB | 21 inspected rows, approx. 104.39 MiB; incomplete | Scanner stopped before completing; not the database total |
| Safety snapshots within that scan | 11 rows, approx. 93.63 MiB | Most inspected serialized bytes belong to snapshots |
| Latest safety copy | 1 row, approx. 8.61 MiB | Additional full snapshot copy |
| Sessions review within that scan | 9 rows, approx. 2.15 MiB | Across browser accounts; rows are not unique incidents, dates or current-user conflicts |
| Library IndexedDB | 5 rows, approx. 5.93 MiB | Includes read cache, recovery originals and access metadata |
| Medical recovery database | Not present | Does not prove Medical has no unsaved/volatile work |
| Current-scope pending markers | 3 modules | Not a count of edits or proof of local durability |
| Browser origin estimate | 72.90 MiB used / 10312.90 MiB quota | Separate measure from serialized size and localStorage limits |
| Persistent storage | Granted | Does not enlarge localStorage limits |
| Profile sync status | Stale Schedule write rejected because central state was newer | A concurrency signal; does not establish a cache-quota cause |

The production report cannot determine the complete Safety/Sessions inventory,
exact review causes or which past event filled localStorage. No personal,
clinical or coaching payload was copied into this document. The existing dialog
was already closed when cleanup was attempted; no subsequent navigation occurred.

## Code findings and implemented correction

The existing diagnostic scans known stores with a 100 MiB approximate JSON-size
budget, 3000-row budget and timeout. A full snapshot can consume that budget before
operation stores are classified. The dialog's top-level success message previously
used only localStorage scan status, even when its IndexedDB section was incomplete.

The candidate queues `count()` for every known store before reading payloads,
inside the same read-only transaction. It reports:

- inspected versus total rows in known stores;
- unknown totals on denied/failed counting;
- row, size or time limits explicitly;
- per-store inspected/total counts when classification is incomplete;
- incomplete status at the top of the dialog, too.

Counts do not identify owners, pending operations or conflicts. Partial categories
and sizes remain partial. Unknown databases/stores/media remain outside the
inventory. No database schema is upgraded or committed by inspection. Payload
serialization can exceed the byte threshold by one row, as before; this is a
bounded scan policy, not a strict bound on allocation for an individual row.

Existing snapshot storage already suppresses identical consecutive snapshots
transactionally. Its ordinary history limit is 30 snapshots (a count, not a byte
budget), and the latest store holds another copy. Recovery rows have separate
protection. A real change to any envelope content/required recovery metadata can
create another full envelope. Thus a large history does not establish that
deduplication is broken or that every row can be removed safely.

## Forward-flow acceptance

`qa/session-new-work-visibility.smoke.spec.mjs` exercises the full app in three
separate browser contexts, with distinct synthetic identities and shared synthetic
HTTP state. It runs with normal cache and with session-cache writes throwing
QuotaExceededError:

1. Start with no central Sessions record. Reading does not create it.
2. Add an exercise through the real UI, edit it and await central acceptance.
3. A second browser context opens the new saved exercise.
4. The first goes offline and commits an objective change to real IndexedDB.
5. The second changes the title and saves centrally.
6. Restore asset/read access but keep the first client's central writes failing;
   reload and verify the exact retained journal and local working value.
7. Accept the pending change but lose its response. The UI stays unsaved and the
   journal remains. Retry the exact operation; one effect only, then saved status.
8. A third empty context, and both editors after reload, show both users' changes.
   Pending journals are empty. In the quota variant the cache failures occurred.

The older two-editor test now also proves visibility from a third empty context
and from both editors after reload. Both files are included in the WebKit saving
suite and the ordinary Chromium smoke suite.

HTTP transport, remote authentication, revisions and receipts are synthetic here.
The fixture uses the real Sessions merge function but is not the production API or
Postgres transaction. Existing API receipt tests provide a separate layer. Reload
in step 6 permits static assets and reads: this does not certify offline app-shell
startup, real disk exhaustion, all supported historical versions or production
performance under many users.

## Decision and next gate

Do not activate the domain-record adapter from this evidence. Smaller database
rows alone would leave whole-calendar reconstruction and local duplication in
place. No changed module persistence architecture is justified by a passing small
fixture or one incomplete storage measurement.

Before a larger persistence change:

1. Release the diagnostic candidate through the authorized Safe Lane, then obtain
   the complete known-store counts on the affected device. Separate stale revision,
   denied storage, quota, network and permission failures rather than grouping them
   all as "cache". Do not resolve historical reviews as part of this task.
2. Measure future snapshot growth and localStorage write failures. Define byte and
   age budgets for replaceable cache separately from unsent/review work. Existing
   saved versions must stay readable; never free capacity by dropping pending work.
3. Run the same flow against isolated staging with the actual API/database and
   dedicated test accounts. Include scope/permission changes and bounded-read/load
   measurements before choosing schema or concurrency changes.
4. If measurements identify whole-document write/read costs, prepare a Sessions
   domain pilot with required date windows/pagination, atomic session/block changes,
   canonical tenant and Library references, one authoritative writer and a tested
   old-client/rollback boundary. Do not backfill or repair historical content under
   this authorization.
5. Admit other modules against the same criteria individually. No platform-wide
   completion percentage or certification follows from this Sessions checkpoint.

## Validation

Local checks passed: `npm run qa:static`, `git diff --check`, 72 API contracts,
39 distinct Chromium cases and 14 WebKit cases (125 scoped cases in total).
The Chromium union includes the initial diagnostic/UI/peer run, the new-work
file, and the restart/crash/version/storage boundary run; repeated diagnostic
cases are counted once. Final candidate SHA and CI status belong to the PR.
The scope includes the diagnostic regression cases, two-editor and new-work
visibility, full-app combined storage failures, browser restart/crash, historical
version transition, distinct snapshot protection and API receipt/durability tests.
Full release/staging/production verification remains a separate authorized step.

## Follow-up: snapshot growth, 27 October 2026

System / Security owns this measurement, based on production source at
`845a0ed95bbd8795bf574a8aeb0c9f37ed903250`. Branch:
`codex/storage-growth-evidence-20261027`. Only tests and evidence change;
no module writer, retention rule or live record is modified. PR #289 is separate:
its full GitHub QA and CodeQL succeeded for `7dde6276`, but it remains undeployed.

The existing production tab was at the login screen during this follow-up.
No reload, sign-in, storage clear, export or repair was performed. A fresh
on-device measurement requires the user to sign in. The 24 October observation
above is not a current reading or a measured growth rate.

### Repeatable measurement

`qa/snapshot-growth.smoke.spec.mjs` runs the actual data-safety service, envelope
creation, distinct-snapshot transaction and pruning code against real IndexedDB
in an isolated browser context. The central queue is a stub; snapshot scheduling
is explicitly controlled, without startup/debounce timers. One unchanged synthetic
Library payload and a 26-byte changing Schedule payload model cross-module
amplification. A new pending generation with unchanged content is also included.

Both Chromium and WebKit produced the following results:

| Phase | History rows | Copies of unchanged Library payload, including latest |
| --- | ---: | ---: |
| Initial snapshot | 1 | 2 |
| Twelve further unchanged snapshots | 1 | 2 |
| New pending generation, same payload | 2 | 3 |
| Ten subsequent tiny edits | 12 | 13 |
| Thirty subsequent tiny edits | 30 | 31 |
| Thirty-six subsequent tiny edits | 30 | 31 |

At the last phase, the 128 KiB fixture occupied about **3.90 MiB** of serialized
history plus latest; the 1 MiB fixture occupied about **31.03 MiB**. These are
JSON UTF-8 sizes, not physical disk usage, browser quota or the UTF-16 estimates
shown in Storage health. The repeated synthetic text may compress differently
from real content. Neither elapsed production growth nor central saving is tested.
Exact values and limitations are retained in
[evidence/snapshot-growth-2026-10-27.json](evidence/snapshot-growth-2026-10-27.json).

All snapshot operations completed, the latest pending generation remained present,
and the unchanged Library value was byte-identical. Seeded fallback recovery,
Sessions review and offline pending rows remained byte-identical after rotation.
This proves preservation of those specific rows, not that every ordinary snapshot
is reconstructible or safe to delete. Existing tests separately cover transactional
deduplication, missing history, metadata changes, save-error preservation and
read-only incomplete inventories. Fourteen cases passed in each browser (28 total).
The new growth test joins the existing WebKit save suite.

### Decision and remaining gate

The measured mechanism is whole-envelope amplification, not failed consecutive
deduplication. A count limit bounds row count, but storage grows with the size of
each envelope. Removing metadata from deduplication would lose distinctions needed
for recovery; blindly shrinking history could discard useful versions.

Before changing production retention or the snapshot format:

1. Complete the fresh device inventory through Storage health after sign-in.
   Record known-store totals, inspected sizes and incomplete classifications;
   do not treat unread data as empty. Separate localStorage pressure from IndexedDB.
2. Obtain comparable follow-up observations during ordinary work. Record time,
   version and known-store counts; a single pair of totals without workload context
   does not establish causality. Preserve payload privacy.
3. Define a byte budget for **new replaceable snapshot history** separately from
   pending/review/recovery data and each module's required local journal. Prove
   reconstructibility before allowing any cleanup. No old-work repair is authorized.
4. Test a bounded snapshot admission/storage pilot: unchanged-data reuse or fewer
   full-envelope captures must preserve exact recovery generations, latest readable
   copies, concurrent-tab atomicity, old-reader compatibility and truthful failures.
   A cache budget must never prevent or pretend to complete a module's durable save.

No automatic deletion, arbitrary byte threshold, new universal save framework or
platform-wide offline certification follows from this measurement. A complete
device inventory and workload evidence are still required to select the pilot.
