# FS Player Database Recovery

Verified on 2026-09-08 after the user's Safe Lane authorization. FS Player owns
this recovery. The shared permission matrix is touched only for FS Player action
compatibility and FS Player entries; no other module's rules or rows are widened.

## Finding And Scope

Both environments lacked ten committed FS Player migrations. Staging also had
an older action-name constraint, despite its recorded presentation migration.
The first staging attempt failed at that constraint and rolled back completely:
zero new migration records, no timeline table and no clip revision column.

The new `20260908221915_video_analysis_permission_action_compatibility.sql`
preserves the existing constraint expression and adds only a `video-analysis`
exception for `present`, `share`, `collaborate` and `process-local-media` when
needed. Missing presentation permission entries are restored without overwriting
existing role configuration. Production already accepted those action names, so
its action constraint is unchanged.

## Exact Migration Set

| Version | FS Player capability |
| --- | --- |
| 20260824212110 | Timelines, collaboration and revision foundation |
| 20260824233000 | Tracking and dynamic graphics metadata |
| 20260825000500 | Pitch calibration |
| 20260825005720 | Portable rendered media metadata |
| 20260825013000 | Multi-angle and export metadata |
| 20260825014500 | Analysis facts read model |
| 20260825043000 | Freehand drawing type |
| 20260826074859 | Idempotent tracking corrections |
| 20260831193000 | Reject and restore corrections |
| 20260831214500 | Entity corrections |
| 20260908221915 | FS-only permission compatibility |

Separate private temporary CLI workdirs were used for staging and production.
Each contained that environment's fetched history plus only these FS files.
Dry runs confirmed the exact pending set. No generic repository-wide database
push, history repair, seed import or role import was used. Original migration
versions and statements were preserved.

For the legacy staging snapshot, apply the compatibility migration alone first,
then the ten older missing FS migrations with `--include-all`. Production used
normal chronological ordering because its prior constraint was already current.
Do not reorder historical source files or mark unexecuted migrations as applied.

## Verified Results

- Staging history: 49 existing plus 11 FS migrations, total 60.
- Production history: 52 existing plus 11 FS migrations, total 63.
- All eleven applied FS statement counts, byte counts and canonical checksums
  match the reviewed source and agree between environments.
- Existing production migration history checksum is unchanged when excluding
  the eleven newly applied records.
- Existing permission rows are unchanged, excluding the two intended new
  collaboration/local-processing entries. Staging's pre-existing permission
  rows also retain their exact checksum.
- Production still has 144 clips. Checksums of all pre-existing clip fields,
  tags, player links, notes, coding buttons and presentations are unchanged.
- All 14 new tables have RLS and deny direct access to `anon` and `authenticated`.
  Metadata writes continue through the existing authorized server API.
- The analysis facts view uses `security_invoker=true`.
- Staging transactional acceptance passed as `service_role`: timeline save and
  replay, cross-team denial, all nine correction types, duplicate operation
  rejection, track/clip revisions, analysis facts and hard-delete protection.
- Test fixtures were rolled back. Staging retained zero clips.
- FS API/module contracts: 410 passed. Static release checks passed, including
  66 migration files, security, release rules, asset and architecture guards.

The repeatable staging-only transaction is in
`qa/video-analysis-database-acceptance.sql`. It must be executed with error
handling enabled; the final success row is meaningful only when every statement
completed successfully. Do not use it to create permanent production fixtures.

## Backup And Limits

Production's latest physical backup was `COMPLETED`, id `1612981816`, timestamp
`2026-09-08T07:07:56.433Z`. PITR was not enabled. This recovery did not change
backup, authentication or unrelated platform settings.

Staging security advisors retained the existing leaked-password-protection
warning. The new RLS-without-policy informational notices are expected for these
server-only tables, whose browser-role grants are revoked. No broad permission
grant or auth change was introduced to silence advisors.

The CLI's optional local catalog cache reported Docker unavailable after successful
remote migration commits. Direct schema/history checks above independently prove
the remote result; no Docker-based local full-database restore is claimed.

This report proves database recovery, not a completed application deployment or
tracking-quality certification. The official code Safe Lane and authenticated
production verification must pass separately before calling the release live.
