# Identity And Recovery Decision

Owner: System / Security / Release. Affected source owners: Squad and Medical; future offline client owner: FS Desktop APP. No other task was activated. This is a reviewed proposal and a read-only audit, not an applied identity migration or completed restore.

## Fresh Identity Evidence

The committed `scripts/sql/platform-identity-foundation-audit.sql` was executed as one SELECT on production at 2026-09-11 14:02:23 UTC. Source revisions were independently re-read immediately afterwards: Squad 1212 and Medical 14788, with matching hashes. Output contains aggregate groups, not player IDs, names or clinical payloads.

The earlier snapshot at 13:59 UTC became stale during review: Medical advanced from 14785 to 14787. `assessIdentityReview` correctly returned `source-changed:football-medical-team-v1` and no proposals. After a fresh snapshot/re-read, planning coverage passed; `crosswalkComplete`, `recoveryVerified` and `migrationAuthorized` remained false. These are historical observations, not a lock against future writes.

| Medical source group | Players | Records | Plans | Identity decision |
| --- | ---: | ---: | ---: | --- |
| Current target, ordinary squad | 28 | 4,011 | 10 | Retain existing canonical IDs |
| Current target, now classified trialist | 1 | 0 | 0 | Retain ID; review source selection flags separately |
| Missing target, academy | 11 | 22 | 0 | Plan scoped identity links without active-roster promotion |
| Missing target, guest | 1 | 4 | 0 | Plan scoped identity link without active-roster promotion |
| Missing target, trialist | 4 | 16 | 0 | Plan scoped identity links without active-roster promotion |
| Missing target, archived squad | 2 | 45 | 1 | Preserve historical identity and archive semantics |
| Missing target, archived guest | 1 | 36 | 0 | Preserve historical identity and archive semantics |
| Missing target, archived trialist | 1 | 2 | 0 | Preserve historical identity and archive semantics |

The 20 missing targets account for 125 records and one plan. Four archived identities are absent from today's Squad source but present in Medical. None may be deleted or matched by name. The SQL includes historical/deleted target identities in its review so an old target cannot silently be recreated as a new person. No historical-target matches or ambiguous target matches were found in this snapshot.

Squad still has 45 source players, but now 28 are ordinary squad and five trialists, rather than the earlier 29/four split. All 29 existing target IDs remain accounted for. Two Medical-versus-Squad selection-flag disagreements now exist, including the previously observed academy case. This does not by itself prove a bug or stale projection; the modules have distinct selection rules. Do not change their flags or force a projection refresh from the audit.

## Recommended Identity Boundary

1. Preserve existing `squad_players.id` links where server-scoped legacy provenance is unambiguous. A category change must not assign a new person ID.
2. Keep person identity, team membership/history and active-roster selection separate. The current projection in `api/_lib/squad-roster-projection.js` accepts ordinary squad only. Its SQL can create active memberships and updates selection metadata; using it to add all missing identities would change behavior for Leaderboard and other consumers.
3. Before adding target rows, review the existing Squad identity schema and every active-roster consumer with the owner. Prefer an explicit scoped legacy-ID mapping to existing canonical identity, with uniqueness and revision guards, over a second independent player master. The exact additive schema/adapter is not approved by this proposal.
4. Preserve the 16 current temporary/academy identities and four historical-only identities independently of whether they are selectable today. Do not invent membership dates, merge people by display name or reactivate archived players. Unresolved provenance remains a blocked mapping.
5. Every future player create obtains stable identity and explicit team membership through the same guarded source contract. Offline-supported creates retain pre-ack identity and operation ID; reconnect resolves dependencies without duplicating or relinking history. Medical remains online-only initially.
6. At cutover, recompute source/target/membership evidence and compare inside the migration transaction. An audit on yesterday's roster cannot authorize today's write. Ongoing create/edit/archive and newly arriving offline operations remain part of reconciliation.

No mapping rows, memberships, roster flags, clinical records or journal statuses were written by this work. The 4,037 older pending events remain a separate reconciliation investigation.

## Backup Configuration Verified

Read-only Supabase Dashboard inspection through the user's existing Chrome session confirmed production project `bustidorxevacosqhkcz`, Football Science NCC:

- Scheduled **physical** backups are listed for September 4-11, 2026. Latest: **2026-09-11 07:08:46 UTC**. This is an observed list, not a promise of eight-day contractual retention.
- Point-in-Time Recovery is **not enabled**; the page offers enabling the add-on. No add-on, compute setting or billing change was made.
- The existing app-state monitor backup/restore-dry-run evidence remains separate: it does not restore the complete relational database or Medical journal.
- Storage object bytes are excluded from database backups, as both the dashboard and [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) state. Their private metadata is not a substitute for recoverable files.

The in-app browser was signed out. The existing Chrome session allowed this verification without reading tokens, changing credentials or creating a new login. No Restore button was clicked. A physical backup listing proves availability of backup entries, not their recoverability.

## Isolated Restore Drill, Not Yet Executed

Use a disposable, access-restricted recovery destination, never production or the shared staging database. A provider-created restore destination can incur cost and must be explicitly approved before creation. A local destination instead requires an approved logical export and a compatible database environment. Do not improvise a production export or restore using a browser token.

| Step | Required evidence / stop condition |
| --- | --- |
| Destination preflight | Record source/destination project identity, snapshot time, allowed operators and cleanup plan. Destination must not serve the live domain. Disable external jobs/webhooks and prevent test clients from reaching production before exercising restored data. |
| Consistent recovery set | Choose an identified backup/restore point and its schema. Include Platform identity, Squad identity/memberships, app-state, Medical journal and dedicated domain tables. Record per-table counts, stable ordered/chunked content hashes, versions, references and journal statuses from that recovery set, not from a different live instant. |
| Private pre-migration capture | Reuse the existing scoped identity snapshot/hash tools with their required reviewed plan hash, user count and explicit capture confirmation. Store sensitive payloads only in the approved private recovery location, never in Git, test fixtures or public logs. A narrow identity snapshot does not replace the full recovery set. |
| Restore and compare | Restore into the isolated destination, then compare counts, hashes, revisions, constraints, relationships, RLS/grants/functions and journal states against the selected recovery set. Verify source production remained untouched. A no-write parse test cannot satisfy this step. |
| Assets | Verify required private object bytes independently against stored hashes and their restored metadata/policies. Distinguish centrally stored images/attachments from device-local FS Player media. |
| Application and authorization | Use isolated QA accounts and correct destination-only configuration. Prove exact saved content is readable, negative cross-tenant/role access and no boot-time overwrite. Any write test uses explicitly disposable fixtures only. |
| Offline and later writes | Account for server writes newer than the restore point and disconnected drafts separately. Test old receipts, late operations, archive/delete, conflict and idempotent retry against the restored version/epoch. Do not assume a server restore contains offline queues. |
| Terminal evidence | Record restore duration, recovery point, actual data gap, comparisons and failures. Keep migration blocked if required bytes, history, mappings or authorization evidence are missing. Cleanup is separately controlled and must preserve the reviewed source backup. |

Daily database backups alone may leave a substantial interval of newer database writes outside the chosen restore point. Select a measured recovery objective and retention strategy before migration; evaluate PITR or another reviewed journal/backup strategy against that objective. No paid upgrade is authorized by this recommendation.

## Current Outcome

- Read-only identity classification and the backup-configuration check are complete for the observed snapshots.
- Eight new review contracts passed; the focused identity/snapshot/inventory/data-safety matrix passed **62/62**. These include fixtures, not live mutation or physical restore.
- Actual identity backfill, actual isolated restore, journal reconciliation and offline end-to-end recovery remain incomplete and block a source-of-truth cutover.
- Next implementation is a synthetic identity/membership migration proof against the reviewed boundaries, alongside preparation of the approved isolated recovery destination. No deployment is authorized.
