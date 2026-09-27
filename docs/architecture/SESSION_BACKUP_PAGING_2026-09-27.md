# Sessions Backup Paging

Owner: System / Security / Release. Risk: Safe Lane, additive database function
and server backup format. No client saving or module business logic changes.

## Confirmed Problem

Read-only production metadata on 2026-09-27: 189 Session save effects occupy
21,267,408 stored bytes and 66,266,919 bytes as JSON. The largest event is 360,284
JSON bytes. The existing atomic RPC aggregates all history into one response;
the validator rejects snapshots above 32 MiB. A statement timeout was also logged
inside that RPC at 08:00 UTC. Raising the timeout cannot remove the size failure.
The exact contribution of database load to that timeout remains unproven.

## Change

- An additive, read-only, service-role-only RPC returns at most 10 receipt/effect
  pairs using a keyset cursor. No application records or history are migrated.
- The first page captures the state record, revision, hash and ledger count. Every
  subsequent page, including a required empty final page, must match that anchor.
- A concurrent state change rejects the export. The caller retains the prior
  archive and latest pointer; it does not accept a mixed or truncated snapshot.
- Each page is semantically validated and compressed losslessly with gzip, with
  uncompressed byte count and SHA-256. The v2 snapshot embeds these chunks, the
  authoritative entry and total count in the existing hashed backup envelope.
- Restore validation decompresses one bounded chunk at a time, checks its exact
  hash/size and receipt/effect identities, and rejects missing/duplicated chunks,
  foreign scope, incomplete effects and receipts beyond the captured revision.
- Existing v1 backups remain readable. Existing permissions and receipt writes
  are unchanged. There is no fallback that silently omits history.

The archive guard remains 32 MiB of serialized snapshot; each decoded chunk is
also limited to 32 MiB. This is a format change, not the same raw-size definition
as v1: the complete decoded history can exceed 32 MiB without loading it all at
once. The 100,000-receipt ceiling is unchanged. This is NOT an unlimited archive.
Low-compressibility histories, oversized individual events, sustained writes
during export or future growth beyond these limits still fail closed. Follow-up
capacity work should use durable immutable object chunks/incremental manifests,
not arbitrary guard increases or history deletion.

## Verification

Local PostgreSQL 17, disposable databases and synthetic data only:

- 30/30 tests across paged backup, existing receipt transactions and real API/client
  integration. Includes over 64 MiB of history, 189 exact events, cross-org negative,
  denied anon/authenticated execution, concurrent change and unavailable page.
- Decoded backup content restored into isolated JSONB tables: exact per-table
  count/content digests and authoritative state value match. This verifies the new
  encoding, not a newly implemented production restore command.
- Existing pg_dump restore test still proves receipt replay and latest-state safety
  under the original database constraints.
- Actual backup API preserves the previous pointer and all Storage objects when
  the final export page fails. Restore drill rejects semantic corruption even
  after the outer archive hashes are recomputed.
- 21/21 focused backup API contracts, including old-format compatibility.
- SQL migration safety, check, release rules, platform security, storage policy and
  architecture budgets pass. No budget was increased.

The dedicated path-filtered GitHub workflow runs all three native PostgreSQL files
without live credentials. Its CI result is pending until this candidate is pushed
and reviewed. Local PostgreSQL requires the sandbox permission to initialize an
isolated cluster; the first sandboxed attempt was blocked before database tests.

## Release Order (Requires Direct User Authorization)

1. Review this candidate and exact-SHA CI, including the native PostgreSQL job.
2. Apply only `20260927192224_session_save_backup_pages.sql` in staging through
   the project's approved database lane. It adds one function; v1 remains present.
3. Run the candidate's backup/export/restore checks in staging using approved QA
   identities. Verify complete counts, scope, hashes and no pointer change on error.
4. Apply the same additive migration in production before deploying the API code.
   The candidate intentionally fails closed if the new function is unavailable.
5. Run the authorized Safe Lane and request a fresh app backup; verify freshness,
   v2 counts, hashes and restore readiness before calling step 1 operationally done.
6. Keep the v1 function during rollout. Do not drop data or purge existing backups.

Rollback: keep the additive function. Reverting the API can read v1 archives but
cannot verify v2; therefore an application rollback also requires a compatible v2
reader or a reviewed earlier backup pointer. Never silently point to an old backup
or delete new archives. No rollback or production mutation was performed here.

## Remaining Program

This candidate closes the local implementation of step 1, not the entire platform
save/read program. Production recovery verification is still required before
claiming the backup incident resolved. Next: authorized server-baseline separation
for Medical/pending drafts, failure-isolated reads with dependency freshness, then
module-by-module durable operations and multi-user/offline acceptance tests.
