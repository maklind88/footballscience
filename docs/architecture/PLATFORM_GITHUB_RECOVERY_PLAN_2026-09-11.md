# GitHub Data Content Recovery Preparation

Owner: System / Security. Scope: recovery tooling only. No product module, database password, schema, source of truth, Live or staging change.

## Existing Access

Read-only GitHub metadata inspection found `SUPABASE_DB_PASSWORD` in the existing `platform-production` environment, updated 2026-08-28. Its value was not read. Supabase Database Health run `34606001534`, created 2026-09-11T13:44:02Z, successfully verified credentials and collected database signals. This proves that run could connect, not that a backup can be restored. No password reset is required merely to prepare the proposed CI path.

## Approval Boundary

The user approved preparing a separate recovery test. The execution safety review additionally requires explicit approval to copy sensitive production data, including player and Medical content, into a temporary GitHub-hosted runner. That destination approval is still pending.

The proposed execution workflow/runner patch was rejected before it was applied. No GitHub workflow, export executor or remote-data test was added. There is no executable `--execute` mode. `npm run recovery:data:plan` is offline and publishes only the reviewed plan. Do not treat this preparation as a completed test or bypass the destination approval through another tool.

## Proposed First Evidence

- Manual execution only, reviewed exact `main` SHA, canonical repository, GitHub-hosted Linux runner and existing `platform-production` environment. No schedules, PR-triggered secret access, self-hosted runners or deploy commands.
- Source fixed to production `bustidorxevacosqhkcz` through the previously verified session pooler `aws-1-us-east-1.pooler.supabase.com:5432`. Use `sslmode=verify-full` and the official Supabase CA, never a TLS bypass or password in command arguments/logs.
- One fixed list of 13 public tables in `scripts/lib/data-content-recovery-plan.mjs`: Platform identity, Squad identity/roster memberships, central app-state records and Medical sync events. All rows, including archived entries, pending receipts and tombstones, are preserved. Auth credential/session tables, other dedicated domain tables and Storage bytes are excluded. Embedded app-state payloads can contain sensitive module data; excluding Auth tables does not make this dataset non-sensitive.
- One held repeatable-read/read-only exported snapshot for column metadata, ordered content hashes/counts and `pg_dump --data-only`. Bound source size, statement/lock time, total duration and concurrency. Fail on unsupported or missing tables; do not skip them or replay journal events.
- Restore only into a newly created private Unix-socket PostgreSQL 17 database. No destination URL and no TCP listener. Do not restore production SQL functions, defaults, triggers, jobs or policies into an internet-connected runner. Reconstruct only a content-test schema using validated built-in column types/order/nullability, then restore the reviewed data-only archive in a transaction.
- Compare all column values, row counts and hashes at the same snapshot; include a restart check. No clinical payloads, per-person identifiers, row hashes, dump files or raw child-process errors in logs/artifacts/caches. Publish only a fixed aggregate result.
- Delete the temporary archive/database after the test and on handled failures. Force-kill/runner-loss cleanup must be addressed explicitly; an ephemeral runner and best-effort cleanup are not a retained backup or absolute erasure guarantee.

This first proposed check certifies only data-content export/restore. It does not restore or validate production constraints, RLS/grants, Auth, application login, extension behavior, all domain tables, object files, offline drafts or the provider physical backup. It must always report `fullRecoveryVerified: false`; it cannot authorize identity backfill, Medical reconciliation or a source-of-truth cutover. Full relational/security recovery remains a separate required gate in `PLATFORM_IDENTITY_RECOVERY_PLAN_2026-09-11.md`.

## Local Preparation Checks

`npm run qa:data-recovery-plan` exercises scope, source/SHA/runner checks, read-only snapshot construction, safe content-schema construction, rejection of unreviewed archive entries, content mismatch detection and the offline-only command boundary. These are synthetic contract tests, not native production restore evidence. Native PostgreSQL export/restore of the existing synthetic identity fixture remains available through `npm run qa:local-recovery`.

Preparation verification on 2026-09-11: 13/13 plan contracts passed, the offline plan command returned `executionEnabled: false`, and syntax checks for all three new JavaScript files passed. `npm run check`, `security:platform`, `release:rules`, `storage:guard`, `architecture:budgets` and `git diff --check` passed. The architecture guard still reports existing oversized-module warnings outside this scope. No workflow was dispatched and no real row data was exported or restored.

Next: obtain explicit destination approval, implement the executor with actual native PostgreSQL/failure/cleanup tests, independently review privacy and source/destination isolation, and only then arrange an authorized exact-SHA execution. No new paid Supabase resource is proposed; GitHub compute and source egress still consume existing quotas.
