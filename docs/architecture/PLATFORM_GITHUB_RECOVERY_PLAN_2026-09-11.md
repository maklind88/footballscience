# GitHub Data Content Recovery Preparation

Owner: System / Security. Scope: recovery tooling only. No product module, database password, schema, source of truth, Live or staging change.

## Existing Access

Read-only GitHub metadata inspection found `SUPABASE_DB_PASSWORD` in the existing `platform-production` environment, updated 2026-08-28. Its value was not read. Supabase Database Health run `34606001534`, created 2026-09-11T13:44:02Z, successfully verified credentials and collected database signals. This proves that run could connect, not that a backup can be restored. No password reset is required merely to prepare the proposed CI path.

## Approval Boundary

The user approved preparing a separate recovery test, then explicitly approved the temporary GitHub-hosted destination for player and Medical data on 2026-09-11 in response to the destination-specific question. Do not broaden the reviewed table scope or retain raw content in logs, artifacts or caches.

The earlier workflow/runner patch was rejected before destination approval and was not applied. After the user's approval, a separate manual workflow and executor were implemented. `npm run recovery:data:plan` remains offline. `scripts/github-data-content-recovery.mjs --execute` fails outside the exact manual main/GitHub environment contract. Nothing has been exported or restored from production yet.

The user separately authorized integrating only this recovery tool into main and running its manual test on 2026-09-11. This is not app-deploy, staging, migration or production-restore authorization. The new workflow must be reviewed and integrated into the default branch before GitHub can dispatch it. Do not modify an existing privileged workflow to bypass this boundary. A manual data-only drill must never call release commands.

## Proposed First Evidence

- Manual execution only, reviewed exact `main` SHA, canonical repository, GitHub-hosted Linux runner and existing `platform-production` environment. No schedules, PR-triggered secret access, self-hosted runners or deploy commands.
- Use pinned checkout/setup-node actions without persisted Git credentials or caches. Install PostgreSQL 17 from its signed official PGDG repository before exposing the database credential; verify the PGDG key fingerprint. System PostgreSQL services are masked on the disposable runner. Only the new private socket cluster runs during the test. No application dependencies or install scripts run with production credentials.
- Source fixed to production `bustidorxevacosqhkcz` through the previously verified session pooler `aws-1-us-east-1.pooler.supabase.com:5432`. Use `sslmode=verify-full` and the official Supabase CA, never a TLS bypass or password in command arguments/logs.
- One fixed list of 13 public tables in `scripts/lib/data-content-recovery-plan.mjs`: Platform identity, Squad identity/roster memberships, central app-state records and Medical sync events. All rows, including archived entries, pending receipts and tombstones, are preserved. Auth credential/session tables, other dedicated domain tables and Storage bytes are excluded. Embedded app-state payloads can contain sensitive module data; excluding Auth tables does not make this dataset non-sensitive.
- One held repeatable-read/read-only exported snapshot for column metadata, ordered content hashes/counts and `pg_dump --data-only`. Bound source size, statement/lock time, total duration and concurrency. Fail on unsupported or missing tables; do not skip them or replay journal events.
- The current limits are 256 MiB of source table storage, aggregate comparison text and compressed archive (each independently checked), 30 seconds per source statement, 2 seconds for locks, 90 seconds per child process and 8 minutes for execution. The holding transaction takes short-timeout access-share locks, not write locks, and can still briefly contend with DDL. This is one manual run, not a recurring monitor. Source reads and egress are not free or load-free.
- Restore only into a newly created private Unix-socket PostgreSQL 17 database. No destination URL and no TCP listener. Do not restore production SQL functions, defaults, triggers, jobs or policies into an internet-connected runner. Reconstruct only a content-test schema using validated built-in column types/order/nullability, then restore the reviewed data-only archive in a transaction.
- Compare all column values, row counts and hashes at the same snapshot; include a restart check. No clinical payloads, per-person identifiers, row hashes, dump files or raw child-process errors in logs/artifacts/caches. Publish only a fixed aggregate result.
- Delete the temporary archive/database after the test and on handled failures. Force-kill/runner-loss cleanup must be addressed explicitly; an ephemeral runner and best-effort cleanup are not a retained backup or absolute erasure guarantee.

This first proposed check certifies only data-content export/restore. It does not restore or validate production constraints, RLS/grants, Auth, application login, extension behavior, all domain tables, object files, offline drafts or the provider physical backup. It must always report `fullRecoveryVerified: false`; it cannot authorize identity backfill, Medical reconciliation or a source-of-truth cutover. Full relational/security recovery remains a separate required gate, not implemented by this tool.

## Local Preparation Checks

`npm run qa:data-recovery-plan` exercises scope, source/SHA/runner checks, read-only snapshot construction, safe content-schema construction, rejection of unreviewed archive entries, content mismatch detection and the offline-only command boundary. These are synthetic contract tests, not native production restore evidence. `npm run qa:data-recovery-native` runs synthetic native PostgreSQL checks using `FS_RECOVERY_PG_BIN`, without production credentials.

Initial preparation verification on 2026-09-11: 13/13 plan contracts passed with execution disabled. After implementation, native PostgreSQL testing found that terminating a client alone could leave its query running; cancellation now sends SIGINT/PQcancel before bounded forced termination. Native tests cover content/restart equality, concurrent source edits at the held snapshot, read-only rejection, missing/unsupported tables, transactional COPY failure, corrupt archives, cancellation and private cleanup. Raw database errors are never forwarded by the runner. These remain synthetic checks, not evidence of a real production restore.

The narrowly scoped integration passed 15/15 offline/execution-boundary contracts, 9/9 native PostgreSQL tests, 1/1 API contract wrapper, check, security:platform, release:rules, storage:guard, qa:supabase, architecture:budgets and workflow YAML/bash checks. It retains only the recovery tool, not the broader audit or identity work. The Linux PGDG bootstrap and the real protected-environment execution remain unverified until the authorized GitHub run; local macOS native success is not substituted for that evidence.

Baseline main `99c06420194262bf8ddc98d48c7de3522abfa296` has four pre-existing Video Analysis test failures in GitHub QA run `34623293045`: two module-contract assertions and two clip-popup viewport tests. They are not changed, skipped or fixed by this recovery-only integration. This is not a green full-platform release candidate. No production deployment workflow is dispatched; the existing Git-production ignore guard remains intact, and the production environment has no `ALLOW_VERCEL_GIT_PRODUCTION` override.

Next: finish candidate validation/review, integrate only this tool under the explicit main-only authorization, then dispatch exactly the reviewed main SHA with `DATA_CONTENT_DRILL_ONLY`. Do not claim success before the real job returns a terminal aggregate result with `cleanupVerified: true`. No new paid Supabase resource is proposed; GitHub compute and source egress still consume existing quotas.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [PGDG Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/), [Supabase session pooler guidance](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres), [Supabase TLS verification](https://supabase.com/docs/guides/platform/ssl-enforcement).
