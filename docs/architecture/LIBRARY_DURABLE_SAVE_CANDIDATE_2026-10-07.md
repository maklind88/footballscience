# Library saving under storage pressure

Task/release owner: System / Security. Affected owners: Exercise Library
(persistence, editor acknowledgement and recovery review), Platform Shell
(shared read/status/export boundary), Sessions (await the library write result).
The user authorized implementation of the recommendation. This is an isolated
candidate; there is no new deployment authorization. The shared root working
tree and other specialists' changes are not part of this candidate.

## Decision

Keep central accepted data authoritative. Move new Exercise Library and folder
work off localStorage, using an account-scoped IndexedDB journal and bounded
read cache. Continue online saving when local persistence fails, but report a
central save only after the exact operation and revision are confirmed. Preserve
legacy copies and previous rollback readers. Do not activate full offline mode
across the platform or clear the browser to make the warning disappear.

This extends the unchanged-copy/snapshot deduplication candidate described in
LIBRARY_STORAGE_PRESSURE_2026-10-07.md. That document's validation applies to the
previous commit; validation of this larger candidate is recorded below.

## Seven acceptance areas

| Area | Implemented and verified boundary | Remaining limitation / activation gate |
| --- | --- | --- |
| 1. Central online saving | Library/folder writes use the existing authenticated API and database CAS; confirmed saving survives localStorage quota and unavailable IndexedDB. UI waits for the asynchronous result. | Other legacy module writers are not migrated by this pilot. API availability and server capacity remain necessary. |
| 2. Storage pressure | Read cache has a 16 MiB approximate UTF-16 budget. Pending baselines are pinned. Pending work has a 64 MiB/1,000-operation admission limit per scope; refusal preserves older work. An uncached receipt retains its pending generation. | These are application budgets, not browser quota reservations. Recovery archives never age out automatically. Historical native copies still consume space. |
| 3. Local copies | Original data lives in IndexedDB on the user's device/browser profile. Transactions must complete before a local save is reported. Open/reopen, aborted transactions and incompatible schemas are covered. | This is not a separate filesystem backup or a guarantee against profile deletion/device loss. App assets and authentication do not yet support a verified cold offline launch. |
| 4. Concurrent work | Immutable changes include the exact observed predecessor per changed record; transactional ordering does not depend on the device clock. Independent records merge; same-record conflicts retain both versions. Retry is a content no-op when the server already has the result. Old whole-library stale writes are rejected. Editor normalization and background refresh cannot silently change its original predecessor. | Same-record independent fields still require review. No durable server operation ledger was added; a lost reply followed by a newer same-record edit remains a retained conflict. Whole-document API size limits remain. |
| 5. Identity and access | Existing canonical scope is rechecked across awaits. Another account does not adopt pending rows. Server write authorization precedes conflict disclosure. Explicit read-policy denial locks the ordinary view and is persisted; recovery data is preserved. Omission alone does not mean deletion or denial. | Offline authorization cannot learn of new revocations without contact. Role/team changes can produce a different saved scope; those original copies require an authorized recovery process. No new tenant migration is performed. |
| 6. Compatibility | Existing localStorage keys and shared snapshot schemas remain readable. Owned/content-matching legacy generations are archived with original bytes and metadata. Unknown legacy generations are not adopted. Shared DB helpers validate stores/indexes and fail closed. | Native copy removal is deliberately not activated: old tabs do not implement an atomic migration protocol. Rollback must retain the new database/journal and its recovery reader until pending work is drained or exported. |
| 7. Recovery and backup | Manual export includes scoped baselines, pending operations and recovery originals. Imported copies wait for explicit review; they never replay automatically. Review refreshes central data and checks the version again before applying. Resolved originals are archived transactionally. | Browser copies are not independent disaster recovery. Server backup freshness, authenticated restore drill, exact-SHA staging and production verification belong to a later authorized Safe Lane release. The review-file size limit is 32 MiB; larger exports need a supported split/streaming recovery path before that workload is enabled. |

No claim of permanent zero-risk storage, universal offline support, or complete
platform migration is made. A normal browser can deny/lose local storage; the
product must distinguish central confirmation, local retention, review required,
and unconfirmed work instead of presenting all four as Saved.

## Failure and recovery behavior

- A local transaction failure does not block an otherwise confirmed online save.
  If both local and central saving fail, the form stays open with an explicit
  error. Memory alone is never called durable.
- No cache eviction removes pending changes, recovery originals, or baselines
  pinned by another pending scope. Cache read failures remain unknown, not zero.
- The server applies changes to fresh central content and writes with its existing
  database compare-and-swap. Access checks and content validation remain enabled.
- Archival is the library's deletion operation. Removing an observed record from
  a submitted whole view is rejected; delayed edits cannot undo a competing
  archive without explicit review.
- An automatic safety review rejected a draft design that inferred revocation
  from omission and filtered exports. That design was not executed. The accepted
  alternative uses an explicit server policy result and preserves the complete
  original recovery export. No approval bypass or data cleanup was performed.
- Failure to load the library save module, an invalid library response, or an
  unavailable native read is isolated from other central module reads. The
  library cannot report a save until its own verified path is ready.
- Legacy pending manifest generations retain their original compatibility path.
  They are not silently adopted into the new journal or acknowledged by a read.
- The manual backup importer refuses automatic replay of a library recovery
  envelope. Storage health links to explicit library review instead.

## Rollout, rollback and remaining work

1. Finish candidate syntax, contract, real-editor, multi-user, Chromium and WebKit
   tests, then exact-commit CI. Preserve the complete validation evidence.
2. With a new direct Deploy safe instruction, use the official Safe Lane. Prove
   backup freshness/restore and staging/live isolation before any production
   change. Deploy the compatibility reader/writer before considering cleanup.
3. Verify a synthetic central save and fresh read on the deployed SHA, including
   full local cache, concurrent users and a network interruption. Do not edit
   real Medical recommendations or choose users' retained versions for them.
4. Inventory native and IndexedDB bytes/counts on the affected device. Current
   storage diagnostics explicitly measure native legacy copies only; a historic
   8 MiB observation is not a current post-migration measurement.
5. Design and test a cooperative old-tab migration before releasing native space.
   localStorage read-then-remove is not atomic, even after a successful archive.
   Do not remove unknown/pending generations or change format without rollback
   evidence. Native space is not yet reclaimed by this candidate.
6. Keep full cold offline launch as a separate product acceptance boundary.
   The current service worker handles notifications, not application asset
   caching. Asset versioning, authenticated scope, offline access expiry and
   upgrade/rollback behavior must be proven before promising offline startup.
7. Expand only through the responsible module's existing write contract after
   the pilot evidence is accepted. Medical's clinical rules and independent
   dedicated APIs must not be replaced with the library's generic record rules.

## Platform coverage ledger

The current shared contract registry contains 24 protected keys. This is a code
inventory plus regression coverage, not a production save certification.

| Module / responsibility | Current boundary in this candidate |
| --- | --- |
| Exercise Library | New scoped journal/cache and record change pilot; four legacy primary/backup keys retained. |
| Sessions | Existing durable date journal/receipts and explicit local review; one consuming library call now awaits the result. No session semantics changed. |
| Medical / RTP | Existing Medical central read, pending preservation and clinical/RTP paths retained; regression tests run. No clinical data migration or new offline promise. |
| Squad / Player Profiles | Existing protected profile document and dedicated identity paths retained. Large native payload remains a cache-pressure follow-up. |
| Schedule | Existing revision-rejected shared document/dedicated boundaries retained; no new offline queue. |
| Periodization | Existing merge contract and date/local-view separation retained. |
| Gameplan | Existing revision-rejected match-preparation contract retained. |
| Set Pieces | Existing scoped journal/play changes retained; shared DB compatibility is regression-tested. |
| Home | Existing task merge and four revision-rejected preference/presentation keys retained. |
| Chat | Dedicated API/database contract remains authoritative. |
| Scouting | Existing dedicated APIs and revision-rejected compatibility key retained. |
| Transfer Room | Existing revision-rejected document, team access and projections retained. |
| Game Simulator | Existing sequence revision guard and library merge contract retained. |
| Video Analysis / Desktop | Dedicated metadata/media paths owned by their specialists; their unrelated working-tree changes are excluded. |
| IDP | Dedicated API/database ownership retained. |
| Leaderboard | Dedicated ledger/audit ownership retained. |
| Football Science DB | Dedicated player/search identity and paging retained. |
| Platform Identity | Existing canonical identity/membership authority retained; browser scope grants no new rights. |
| Platform Shell / Appearance | Existing workspace, structure and appearance contracts retained; library status/export/read-denial integration is additive. |
| Platform Readiness | Derived diagnostics only; no ownership of saved coaching data. |

Remaining platform-wide acceptance needs per-module evidence for full quota,
account changes, delayed/lost receipts, simultaneous users, delete/archive replay,
restore over newer work, sustained growth and supported offline boundaries. A
green broad regression suite does not substitute for those workload proofs.

## Validation evidence

Pre-commit evidence:

- Full API suite: 3,410 passed after isolating the new fixtures' actor IDs. The
  prior broad run hit the shared test actor's rate limit in a Medical case;
  production rate limits were not disabled or increased. Medical's separate
  21-case contract file also passed.
- Four real-editor Chromium cases passed: full native storage with IndexedDB
  available/denied, independent users plus a same-record conflict during a
  background refresh, and app reload during an API outage with later replay.
- A further real-app case passed with the library save-module request failing:
  unrelated central reads still complete and library writes fail explicitly.
- Fourteen WebKit storage/compatibility cases passed, including real export-file
  import plus explicit review, exact pending acknowledgements, immutable IDs,
  reversed device time, quota pressure, denied access and reopen, upgrade
  blocking/abort, and schema mismatch without deletion.
- Focused isolation/read-status contracts passed after the module-failure change.
- The first broad QA pass found missing new dependencies in two VM test harnesses;
  these were corrected without relaxing their assertions. The second full
  browser run is tracked separately; exact-commit CI remains the readiness gate.
- Synthetic local protocol benchmark: 512 records / approximately 2.47 MiB UTF-16,
  30 measured runs after warm-up, p50 14.09 ms and p95 21.37 ms for change creation
  plus application. This excludes rendering, IndexedDB, network, database and
  backups and is not a production latency or scale guarantee.

Final static/security/storage/performance/architecture checks passed before
commit, including the existing architecture warnings. GitHub PR evidence records the resulting exact commit
and final full-suite outcome. No staging, production deploy, live write or remote
schema migration has been performed for this candidate.
