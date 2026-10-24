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
