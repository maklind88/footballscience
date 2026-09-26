# Sessions Lost Receipt Recovery

## Status And Ownership

Locally verified implementation checkpoint, NOT deployed. System/Security owns the
API/save boundary; Sessions owns training semantics. No remote database,
user recovery queue or Live data was changed. The user subsequently authorized
`Deploy safe`. The earlier failing precheck is now addressed below; deployment
still requires verified runtime configuration, migration and staging evidence.

Branch: `codex/session-receipt-recovery-20260925`.
Starting HEAD: `7c786a24acb8bfa0b0c4ac0bde71369ad60b3d08`.
The earlier ordering fix remains separately preserved in
`/private/tmp/footballscience-session-save-quota-investigation`.

## Reproduced Cause

The server accepted A, but its response was lost. Retrying the immutable
operation previously either wrote another revision/audit entry, or reported
a conflict after a later same-field B. The API echoed the operation ID without
a durable registry of accepted operations. Revision CAS alone cannot distinguish
an accepted retry from a never-accepted edit.

Before this fix, all six cases (three orderings, Storage and database modes)
failed in ten repetitions: 60 failures. Evidence:
`/private/tmp/session-receipt-recovery-repeat.json`.
This proves a fault under response loss, not the cause of every reported Live
incident. It does not prove that newer B was lost. Existing user conflicts must
not be discarded or automatically marked saved.

## Implemented Database Contract

- One PostgreSQL transaction commits state, an immutable operation receipt and
  audit/history events. A failed event insert rolls the entire transaction back.
- Identity binds the existing server-owned record scope, actor, key, date,
  immutable operation ID and canonical payload digest. Reusing an ID with a
  different payload is rejected.
- Authorization precedes receipt lookup. A receipt never grants permission.
- A duplicate returns proof of A plus current B, without replaying A, increasing
  the revision or duplicating history. Never-accepted conflicting edits still
  conflict. Device clocks never choose a winner.
- Concurrent duplicates serialize in the transaction; other writes still use
  the existing row/revision CAS. Missing RPC/receipt storage fails closed.
- Audit/history readers include the committed events; appending a legacy audit
  does not copy these events back into Storage. History restore in database mode
  uses a verified database base revision, not an unversioned Storage-only write.
- The additive migration exposes neither tables nor RPC to anon/authenticated.
  The service role can read/insert receipts/events, not update/delete them.

There is NO automatic switch of `APP_STATE_DATABASE_MODE`, lazy migration,
receipt expiry, recovery-queue purge, permission bypass or timeout increase.
This is not a redesign of the existing global organization scope or certification
of platform-wide tenant isolation.

## Storage And Backup Boundaries

The date-scoped Sessions protocol now explicitly requires the database source.
An authorized request in Storage-only mode returns 503
`SESSION_DATABASE_REQUIRED`, without changing central state. The client retains
the immutable operation in its retry journal. Tests prove that the same operation
can complete after database readiness is explicitly restored. There is no unsafe
Storage fallback or separate non-atomic receipt write. Legacy full-snapshot paths
and other modules are not silently migrated by this change.

In database mode the existing app-state backup endpoint now obtains the Sessions
record, receipts and effects through one consistent SQL snapshot. It includes
that snapshot in the backup checksum and validates scope, identities, revisions,
hash and event completeness during the restore drill. A missing RPC or incomplete
snapshot fails before publishing a new backup pointer. Export limits are explicit
(100,000 receipts and 32 MiB); an oversized export fails rather than silently
omitting rows. Receipts are not expired or pruned.

This adds export/integrity verification, not a new production restore/import
endpoint. The existing 13-table content drill does not cover these new tables.
The local PostgreSQL dump/restore proof below is a separate recovery mechanism.

## Verification

Real PostgreSQL 17 runs on a private local Unix socket with synthetic data.
The foundation is a dependency-closed migration slice, not the complete Live
schema. The HTTP boundary uses synthetic auth/Storage and real SQL for receipts,
records and RPC. Client journals in these tests are Maps, not a real browser
IndexedDB/restart proof.

- Native SQL + actual client/API integration: 22 passing tests, including parent
  tests. Covers both HTTP and database-RPC lost replies, later independent/same
  field edits, restart, concurrent identical/different operations, rollback,
  scope separation, denied database access and revision regression. Accepted
  replays with a freshly resolved non-editor actor return 403, no receipt/content
  and no state mutation. This does not certify existing auth-cache invalidation.
- Real `pg_dump`/`pg_restore` into a second local database preserves exact row
  counts/content digests for records, receipts and history. Retry A after restore
  keeps latest C and changes none of those tables. Concurrent snapshot tests
  prove that each export contains the record and corresponding receipt/event
  count. The actual backup endpoint uses this snapshot despite a stale Storage
  mirror; the restore drill rejects a missing event even if its checksum is
  recomputed. This is NOT verification of the deployed backup system.
- Targeted API matrix: 134 passed, no failures. Evidence:
  `/private/tmp/session-receipt-ready-api.json`.
- Six lost-receipt/readiness cases repeated ten times: 60 passed, no flaky
  retries or skips. Evidence: `/private/tmp/session-receipt-ready-repeat.json`.
  Storage-not-ready cases assert 503 and an unchanged durable operation first,
  then explicitly enable the database fixture and exercise the lost response.
- Full API contract suite: 2,910 passed, no failures (canonical config).
  Evidence: `/private/tmp/session-receipt-full-api.json`.
- Chromium offline/replay coverage: 6 passed. Real IndexedDB, closed/reopened
  browser profiles and two-page newer-write cases are exercised against mocked
  server responses, not a combined real-browser/real-PostgreSQL environment.
  Evidence: `/private/tmp/session-receipt-ready-browser.json`.
- `npm run qa:static` passed, including check, security, release rules, storage,
  Supabase migration checks, performance and architecture budgets. No budget
  was raised. Local release credential/readiness warnings remain.
- Test-local rate-limit buckets are reset between independent API tests; the
  limiter remains active within each test and security contracts pass unchanged.

```sh
env FS_RECOVERY_PG_BIN=/path/to/PostgreSQL17/bin node --test qa/session-save-receipts-native.test.mjs qa/session-save-receipts-integration-native.test.mjs
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/api-contracts.api.spec.mjs qa/app-state-database-source.api.spec.mjs qa/session-durable-save.api.spec.mjs qa/session-save-receipts.api.spec.mjs
```

## Remaining Release Preconditions

1. Verify the actual deployed persistence-mode value. Read-only production
   inspection found Sessions database revision 21298 updated at
   2026-09-25T22:45:18.952354Z and its Storage object updated about 0.7 seconds
   later. Vercel lists `APP_STATE_DATABASE_MODE` as an encrypted production
   setting. These observations support, but do not prove, the runtime value.
   Reading that one encrypted value is awaiting explicit user permission.
   Any source cutover would need a separate reviewed migration; none is hidden
   in this change.
2. Verify backup readiness and apply the additive migration before publishing
   code that requires its RPCs. Inspect staging schema/permissions, then verify
   authenticated save, reload, retry and backup using dedicated QA data. Do not
   rewrite coaching data or discard existing conflicts.
3. Retain the receipt ledger during rollback/recovery. Never drop or clear it
   to make checks pass. Monitor export size and design a consistent paginated
   archive before the explicit export limit is reached.
4. Run the official Safe Lane and exact-SHA staging/production verification.
   Local tests do not establish that the current Live incident is resolved or
   certify whole-platform offline behavior.

No new push, PR, main merge, remote migration, staging or deployment has been
performed. Full-platform offline support remains outside this checkpoint.
