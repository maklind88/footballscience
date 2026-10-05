# Backup source integrity candidate

Owner: System / Security. Branch: `codex/backup-read-integrity-20261005`.
Base: `cf3195a4d9a71792ecd336eb57980338da96d18e`. This is a separate,
compatible candidate from PR #252. No deployment or production data mutation.

## Problem and decision

The generic app-state backup read Storage even when the serving API used
`platform_app_state_records` as its primary source. A failed compatibility
mirror write could therefore leave a successful backup with stale content.
The dedicated Sessions snapshot already used its database/receipt contract.

Storage read failures and malformed records also returned null, allowing
collection to declare a key absent and publish a new latest-backup pointer.
This confused inability to read a record with confirmed absence.

The candidate reads the configured database first for generic keys. An existing
database tombstone is authoritative and cannot fall back to a stale active
Storage copy. Only a successfully confirmed missing database record permits
the same legacy Storage fallback supported by the serving API. Backup never
seeds the database. Sessions retains its dedicated snapshot path.

A small backup-source helper validates record identity and value type, limits
collection to the existing global namespace, and throws on read failure or
malformed records. Confirmed Storage missing-object responses remain valid
absence, including the precisely recognized wrapped-404 form. Unknown 404
errors, other HTTP errors and malformed successful responses stop publication.
No backup object or latest pointer is written when source collection fails.

The shared single-record database adapter now rejects malformed response
containers, duplicate records, wrong key/organization and invalid value types.
Otherwise normalization could disguise a malformed database response as an
absent row and incorrectly authorize fallback. List/write behavior is unchanged.
Backup status, repair and audit routes retain their existing contracts.

## Evidence

- Real backup handler exercised with synthetic fetch responses; no live data.
- 25 source-integrity cases cover HTTP failure, malformed data, source priority,
  tombstones, missing-row fallback, organization boundaries and no database writes.
- Initial regression run reproduced the old incorrect behavior. The test suite
  now resets the existing rate-limit buckets between cases, following the
  repository's established API-test pattern; production limits are unchanged.
- Combined new-source, existing API, database-source, Sessions backup, fresh
  backup verification and platform-safety suites: **180 passed**.
- `npm run qa:static` and `git diff --check`: passed. Existing architecture-size
  warnings remain.
- Native PostgreSQL 17 CI on `973073f76fc40b1d50ebe31419d58acbe4ffe6a5`: **32 passed**,
  including concurrent saves, lost replies, consistent snapshots and restored receipts.
  Evidence: https://github.com/maklind88/footballscience/actions/runs/37366577467
- The full local API run exposed a pre-existing test harness bug: URL `pathname`
  passed `%20` to Node when the checkout path contained a space. The recovery CLI
  itself worked. The test now uses `fileURLToPath`; all 15 offline recovery tests
  passed in the same space-containing checkout. Production recovery code is unchanged.
- Full local API suite after the harness correction: **3,243 passed**.
  `qa:static`, syntax and diff checks also passed after that correction.
- Logs: `/private/tmp/fs-backup-source-regression.log`,
  `/private/tmp/fs-backup-full-api-fixed.log` and `/private/tmp/fs-backup-static-final.log`.

## Limits and next checks

This preserves the current global app-state backup contract; it does not claim
coverage of every organization, relational module, Storage object or media file.
Independent generic keys are not read in one atomic cross-module transaction.
Sessions snapshot validation remains separate. Native PostgreSQL verification
passed on the implementation commit above; full CI must also pass on the final
candidate SHA. The generic source-integrity cases use simulated responses.

Actual production `APP_STATE_DATABASE_MODE`, backup retention, PITR configuration
and a full isolated restore drill still need verified operational evidence.
The dedicated Squad status-repair route is not changed to a database writer by
this candidate and must not be mistaken for whole-platform restore support.

Supabase's current documentation confirms that database backups contain Storage
metadata but do not restore Storage objects themselves. Media recovery requires
separate coverage: https://supabase.com/docs/guides/platform/backups
Changelog reviewed: https://supabase.com/changelog.md. No schema, extension,
Supabase SDK, RLS, permission or authentication changes are introduced here.

Release requires direct user authorization and Safe Lane. The prior successful
backup must remain available on any read error. After an authorized release,
verify the backup's entry revisions against the configured source and run a
restore drill in an isolated target before claiming full recovery readiness.
