# Local Recovery Preparation

Owner: System / Security. User decision: reuse existing resources; no new paid Supabase project. No production/staging restore, schema change, backfill or deployment is authorized by this preparation.

## Toolchain And Isolation

- PostgreSQL 17.11 from Postgres.app 2.9.6, the PostgreSQL 17 distribution linked by the [official macOS downloads page](https://www.postgresql.org/download/macosx/).
- Download: `https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-17.dmg`.
- SHA-256 matches the publisher's GitHub asset digest: `b38bb00b8c8702a568270aab85995c550f7f93d1503b818efdc5ff9a519b7168`.
- Apple's `codesign --verify --deep --strict` passed outside the restricted execution sandbox. No signature bypass, re-signing or quarantine removal was used.
- Tools are unpacked at `/private/tmp/footballscience-recovery-pg17.pU08eR/Postgres.app/Contents/Versions/17/bin`. This temporary path is an observed local setup, not a portable or permanent installation. Revalidate availability before reuse.
- No system installation, PATH change, login item, open TCP port or background database service was added. The read-only installer disk was unmounted after copying the tools.
- FileVault reports `On`. That protects storage at rest; it is not a substitute for file permissions, operator access control or separate backup encryption/retention decisions.

## Executed Native Proof

```bash
FS_RECOVERY_PG_BIN=/private/tmp/footballscience-recovery-pg17.pU08eR/Postgres.app/Contents/Versions/17/bin npm run qa:local-recovery
```

The command creates its own temporary PostgreSQL cluster. It accepts only the tool directory, not a database URL, backup path, password or remote project. Child processes receive a minimal environment and an explicit private Unix socket. The directory/socket have mode 0700 and the archive mode 0600; TCP listening is disabled. It reuses the synthetic identity fixture, not real player or clinical data.

Eight Node tests passed (one parent and seven scenarios): private socket/no TCP, custom-format `pg_dump` archive with all seven fixture tables, exact recovery-point hashes despite later source edits, restart persistence, restored foreign keys, fail-closed repeat restore and rejection of an invalid archive. Counts, source revisions, history, receipt payloads, constraint definitions and indexes are compared. The cluster is stopped and its synthetic files removed on normal completion, including assertion failures. An abrupt process/machine kill is not a tested cleanup guarantee; inspect processes before restarting after interruption.

The sandbox initially denied PostgreSQL shared-memory creation before any database test could run. The same command passed with approved local execution permissions and without changing the product or test assertions.

Final scoped validation: native recovery 8/8 on two complete runs, existing identity proof 23/23, and identity/snapshot/inventory/data-safety API contracts 62/62. `npm run check`, `security:platform`, `release:rules`, `storage:guard`, `architecture:budgets`, syntax and diff checks passed. The architecture guard still reports 82 pre-existing oversized module files; this work changes none of them. No full browser/live suite or real export was run.

This command is an explicit preparation check, not part of the default UI/release gate. It requires verified native PostgreSQL 17 binaries and fails if they are absent. The prior PGlite proof remains separate.

## Real Export Still Blocked

No export connection was configured in this worktree's environment, the shared root's top-level environment files, or the user's standard PostgreSQL service/password files at inspection. No credentials were extracted from a browser, password manager or another task. No production payload was downloaded. Existing MCP read-only SQL access does not provide the direct PostgreSQL connection required by `pg_dump`.

Use an approved direct/session-pooler connection to the exact production source, verified TLS and bounded read-only export settings. Supply credentials privately through a local non-echoing prompt or an approved protected credential mechanism, never chat, command arguments, Git or logs. Do not reset passwords, create roles, purchase add-ons or change Live configuration just to unblock this step.

Before export, review the exact schema/table scope and dependencies, including identity, memberships, app-state and Medical journal. Minimize sensitive data; exclude credential/session material unless explicitly necessary and approved. Use a consistent identified snapshot and compare against that snapshot, not a later changing Live state. Preserve the selected archive privately outside Git and cloud-synced project folders; no schema SQL from an unreviewed source is executed blindly.

Restore only into a new local, isolated destination. Do not overwrite Live or the shared staging database. Existing staging may serve later bounded QA with disposable fixtures, but this preparation does not authorize replacing its data or loading production Medical/Auth data into it.

## Limits And Next Decision

- The native proof is synthetic. It does not certify production recovery, product RLS/roles, Supabase extensions, complete application login, assets or offline recovery.
- A later logical export/restore tests that export. It does not validate the existing provider-managed physical backup. Physical backups are not directly downloadable through the normal backup view; see [Supabase's guidance](https://supabase.com/docs/guides/troubleshooting/download-logical-backups).
- Database backups do not contain Storage object bytes or disconnected device drafts. Their recovery evidence stays separate.
- Real recovery remains incomplete until approved access, consistent export, private local restore and content/relationship/security comparisons pass. Keep the identity backfill, Medical reconciliation and source-of-truth cutover blocked in the meantime.

Follow-up: the verified TLS connection reached the production session pooler, but the user does not have the current database password. No password was saved or reset. Existing GitHub `platform-production` credentials successfully ran database health inspection on 2026-09-11. See `PLATFORM_GITHUB_RECOVERY_PLAN_2026-09-11.md` for the proposed alternative: a bounded data-content drill using that credential inside an ephemeral runner. The external destination still needs explicit approval; no executor, workflow or real export has been enabled.

The complete recovery checklist in `PLATFORM_IDENTITY_RECOVERY_PLAN_2026-09-11.md` remains required. Neither a connection check nor the proposed data-only drill certifies full recovery. No new paid Supabase project is needed for the proposed path.
