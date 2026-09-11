# Medical Note Read Boundary

Date: 2026-09-11. Owner: System / Security. Affected domain: Medical.
Status: release authorized, blocked in local QA; no remote migration or deploy.
Risk class: Safe Lane (database permissions and private clinical text).

## Scope And Decision

The previous relations/permissions audit reproduced direct authenticated SELECT
of unshared `coach_note`, bypassing the existing views' sharing mask. The invoker
views also lacked grants for their lifecycle predicates. This patch addresses
those two read-boundary defects only, for recommendations and availability plans.

The source inspection found no application consumers of these raw tables or
coach views in `api/`, `src/` or `scripts/`. The existing Medical server path uses
the durable sync-event inbox and central-state projection. External consumers
have not been inventoried. Direct raw-note access is intentionally removed.

- Revoke table/column note access; explicitly grant only the original safe fields
  plus `deleted_at` / `archived_at`, needed by the invoker views.
- Keep view names, field names/order/types and `security_invoker=true`.
- Use two private, UUID-keyed, read-only accessors with an empty `search_path`.
  They require sharing, a non-archived row, and the existing Medical staff/team
  membership checks. Calls with guessed IDs do not bypass these checks.
- The existing backend database `service_role` remains supported; a client JWT
  claim cannot substitute for that database role.
- No clinical rows, inbox statuses, central-state values, constraints, policies,
  API writes, UI, offline storage or release scripts change.

A UI-only mask would leave direct reads exposed. Filtering all unshared rows
would incorrectly hide availability. A non-invoker view would broaden the
privilege boundary. The chosen accessor exposes only the permitted note text.

Each shared note uses a primary-key lookup; no schema copy, backfill, background
worker or cached permission list is added. Million-record latency has not been
benchmarked. Future paginated database readers still need workload testing.

## Local Evidence

- Native PostgreSQL 17.11: **36/36**, including the original failure, allowed and
  denied reads, membership/share revocation, cross-team/org IDs, malformed
  identity claims, direct accessor calls, temporary-object shadowing, existing
  backend writes, broad-grant removal, failed-migration rollback, repeat apply,
  schema/data backup-restore and database restart.
- The harness sets both session authorization and active role; it does not let
  the synthetic administrator's role-switch rights weaken negative tests.
- Counts and SHA-256 content digests for synthetic recommendations, plans,
  Medical sync events and central state remain identical. Existing RLS policies,
  triggers and constraints remain identical.
- Focused Playwright API contracts: **34/34** (7 new, 27 existing), including
  Medical projection/ack/idempotency, archive behavior and protected writes.
- `npm run check`, `security:platform`, `release:rules`, `storage:guard`,
  `qa:supabase` (67 migrations), and `architecture:budgets` passed. Architecture
  still reports pre-existing oversized module warnings; this patch adds none.
- First local API start was blocked by sandbox port permissions. The canonical
  config then passed with approved local execution; no test was weakened.

Native rerun, with an existing verified PostgreSQL 17 installation:

```sh
FS_RECOVERY_PG_BIN=/path/to/postgresql-17/bin node --test qa/medical-note-read-boundary-native.test.mjs
```

The helper accepts no remote database URL, creates a private Unix-socket-only
cluster, uses synthetic identities and removes its cluster after the run.
It loads a dependency-closed foundation migration slice, not every production
migration. It is not a live PostgREST/JWT verification or real-data restore drill.
The `.api.spec.mjs` file is discovered by the normal API suite; the native suite
must be run explicitly and fails if PostgreSQL 17 is unavailable.

## Before Any Release

1. Obtain the user's explicit release authorization. Review publication scope
   before pushing; keep unrelated audit details out of the public repository.
2. Compare current remote columns, policies, helper definitions, effective role
   memberships/grants and view contracts with the audited foundation. Confirm
   `app_private` is not a Data API exposed schema and review external consumers.
3. Use the existing Supabase Safe Lane and verified backup readiness. Apply only
   this migration to the existing staging environment; no pending-event cleanup
   or switch to database reads is part of it.
4. Verify authenticated PostgREST access using intended synthetic QA identities:
   safe rows readable, shared notes correct, unshared/private raw columns denied,
   foreign teams denied, Medical server writes and reload still work. Compare
   source row counts/content hashes privately without publishing clinical data.
5. Only after these checks pass, apply the exact reviewed migration to production
   and repeat the scoped read/API checks. An application deploy alone does not
   apply this database patch. No other pending migrations may ride along silently.

The migration is transactional with a 3-second lock timeout and 30-second
statement timeout. A failed apply leaves the previous schema intact. After a
successful apply, prefer a forward correction; do not restore broad note grants
as a routine rollback, since that reopens the original exposure. No data restore
should be necessary for this schema-only patch.

## Release Attempt: 2026-09-12

- Rebased cleanly on `origin/main` at `eb6492a68f2a6b672239f56c790b563804382c4b`.
- Native PostgreSQL checks passed again: 36/36. `npm run check` and diff-check
  passed. Remote preflight was read-only; no training records were modified.
- Validation-only `release:ship:safe` stopped: 3004 passed, 6 failed, 3 skipped,
  25 not run. Five failures shared a missing local FFmpeg executable.
- Fresh isolated `npm ci` dependencies fixed those FFmpeg failures. The focused
  rerun passed 21/22; the remaining existing FS Player playback test still timed
  out at `qa/video-analysis-playback.smoke.spec.mjs:969` because it accesses
  Outcome without opening the separate Edit clip dialog. The same test and
  renderer are unchanged from main; no FS Player file was edited here.
- The staging transaction-proof script passed against local PostgreSQL and
  rolled back all synthetic rows. It has NOT been run against staging.
- No branch/main/staging push, remote schema change, or production deploy was
  performed. Resolve the module test blocker, rerun the required full gate, then
  complete the staging/database/release verification above. This is not a green
  release or a completed database rollout.

## Remaining Work

This is not a declaration that all database authorization or migration readiness
is complete. Broader audit work remains tracked separately and is not included
in this release. Any future policy change must also be reflected in the private
note accessors.
Offline outbox/idempotency and a migration of Medical's live source of truth are
unchanged and must preserve future team/player creation and pending local edits.

Reference: PostgreSQL documents that a table-level REVOKE also revokes its
[column privileges](https://www.postgresql.org/docs/17/sql-revoke.html), while
revoking a column alone does not override a table-level grant.
