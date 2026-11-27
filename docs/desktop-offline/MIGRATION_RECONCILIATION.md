# Supabase Migration Reconciliation

Audit date: 2026-08-31

## Local baseline addendum — 2026-09-05

The original 60-file ledger below is historical. The reviewed remote desktop commit `f63458a2` and current main baseline `ee2dff68` already contain **63** repository migrations. This review changes none of them and preserves the original checksum ledger. The three additions after the audit are:

| Repository migration | SHA-256 | Remote status in this review |
| --- | --- | --- |
| `20260831120449_squad_roster_projection_for_leaderboard.sql` | `8e9971e16a52bd16145be30a3b737d6952ec7969f4c5b3587eb65966bb2d4e91` | Not reverified |
| `20260831200058_leaderboard_active_staff_identity_repair.sql` | `46f32282eb978e802d616219657b21261379a84ecfeb9a8f799b56972429f38e` | Not reverified |
| `20260901103202_medical_plan_canonical_projection.sql` | `546ce187e4a2b927664429809ee9e5966706062f445450566289732ae5949fb1` | Not reverified |

The original **49 production / 48 staging** counts must not be presented as current counts. Revalidate these additions, aliases and catalog drift before connecting a real sync adapter or promoting any SQL draft. This phase only corrects authorization checks in the existing disposable-test draft; it does not create a synchronization migration or repair remote history.

## Original audit

Status: read-only reconciliation complete enough to block unsafe schema work. No migration, history repair, database push, database pull, DDL, DML, Auth change, Storage change, or remote configuration change was executed.

Projects:

- production: Football Science NCC (`bustidorxevacosqhkcz`)
- staging: Football Science Staging (`pokrksgempkuraueglpu`)

The authoritative local SHA-256 list is `docs/desktop-offline/MIGRATION_LOCAL_CHECKSUMS.sha256`. It contains and verifies all 60 SQL files.

## Method

The audit did not equate a filename or history row with successful application. It compared:

- local version, name, byte content, and SHA-256;
- remote version, name, statement count, statement bytes, and stored-statement MD5;
- all 137 public relations in each environment;
- table columns, defaults, constraints, indexes, user triggers, RLS state, policies, and effective anon/authenticated/service-role grants;
- public and `app_private` function signatures, definitions, security mode, and execute grants;
- Realtime publication membership, event triggers, Storage buckets, and Storage policies;
- non-user configuration effects in the permission matrix and module migration checkpoints.

No private row body, token, credential, medical record, user identity, or football content was copied into this report. The production-only active-coach data repair is classified `unable to prove safely` at row-effect level because proving it would require inspecting identity rows and business intent.

## Why the counts are 60 / 49 / 48

The difference is deterministic:

1. The first 44 logical migrations end at `20260716234500_rtp_exercise_diagram_media_status` and have a history row in both environments.
2. Two app-state migrations exist in both environments under environment-specific versions rather than the local versions.
3. `medical_sync_event_projection` exists in both under environment-specific versions.
4. `leaderboard_foundation` uses the local version in production and a later version in staging.
5. `leaderboard_active_coach_identity_repair` exists only in production.
6. Eleven other local files have no remote history row in either environment.

Therefore production has `44 + 2 + 1 + 1 + 1 = 49` history rows and staging has `44 + 2 + 1 + 1 = 48`. The 60 local files are not 60 expected production migrations: eleven are staged/unapplied and four logical migrations have timestamp aliases.

## Cross-environment object evidence

| Surface | Production | Staging | Finding |
| --- | ---: | ---: | --- |
| Public tables | 135 | 135 | Same relation names; all 135 have RLS enabled. |
| Public relations including views | 137 | 137 | No production-only or staging-only relation. |
| Public constraints | 1,515 | 1,515 | Mostly identical; permission action constraint differs. |
| Public indexes | 644 | 510 | Material index drift; production contains a large advisor-generated FK-index supplement. |
| Public policies | 192 | 140 | Production has 48 extra `*_deny_all_authenticated` policies plus four other policy differences. |
| User table triggers | 161 | 159 | Production contains two additional trigger effects, including the Video audit hard-delete guard. |
| Authenticated SELECT relations | 71 | 71 | Effective read grants match. |
| Authenticated DML relations | 0 | 0 | Neither environment grants ordinary authenticated clients table DML. |
| Public/`app_private` functions | 87 | 87 | One exclusive function per environment; see below. |
| Storage buckets | 4 | 4 | Metadata matches; the staged Scouting import bucket is absent in both. |
| Storage policies | 2 | 2 | Current policies match; staged Scouting upload policy is absent in both. |

Additional drift:

- production-only `public.rls_auto_enable()` plus the `ensure_rls` event trigger automatically enables RLS after public-table creation; this is not represented in the local migrations;
- staging-only `public.upsert_chat_read_receipt(...)` is executable by `anon`, `authenticated`, and `service_role`; it is not represented in local migrations and requires a separate security review before staging can be a trusted baseline;
- production accepts arbitrary permission actions of length 2–120; staging still restricts actions to the original seven-value list. The local Presentation Builder migration expects the production form and also expects `present` and `share` rows;
- production has the `video-analysis` `present` and `share` permission rows; staging does not;
- Realtime contains six Chat relations in production and eight in staging. Production is missing `chat_attachments` from the locally intended six and includes `chat_action_items`; staging includes both plus `chat_message_user_states`;
- apparent column drift in `video_clip_instances` and `video_playlist_items` is physical column order only; names, types, nullability, defaults, and constraints are semantically the same;
- the application-state, Medical projection, and Leaderboard core columns/constraints/triggers/function definitions match between environments. Production has additional indexes and deny policies.

## Complete 60-file matrix

The checksum column is the first 12 characters of the full SHA-256 in `MIGRATION_LOCAL_CHECKSUMS.sha256`.

| # | Local migration | SHA-256 | Production history | Staging history | Actual object evidence | Classification and future remediation |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `20260507130000_chat_module_multitenant` | `26de207f3c84` | exact | exact | Chat base tables, constraints, triggers, RLS and grants exist in both. | aligned; retain local file, track supplemental index drift separately |
| 2 | `20260507185637_squad_module_multitenant` | `42e0486669aa` | exact | exact | Squad relation shapes/constraints/grants align; production has extra indexes. | aligned core; production/staging drift in supplemental indexes |
| 3 | `20260507230628_medical_module_multitenant` | `fefeac07beeb` | exact | exact | Medical tables/RLS/server-only grants align; production has extra indexes. | aligned core; retain as canonical logical migration |
| 4 | `20260507230705_chat_realtime_search_v2` | `b38f7b7edecd` | exact, SQL fingerprint differs | exact, SQL fingerprint differs | Function/catalog core aligns, but Realtime membership differs from local and between environments. | migration history exists but expected object differs; create a future additive Realtime convergence migration |
| 5 | `20260507234337_chat_storage_attachments_v1` | `fe75e848b7d8` | exact | exact | Attachment bucket/policies and table objects exist; Realtime attachment membership differs. | aligned Storage core; Realtime remediation belongs with row 4 |
| 6 | `20260508000000_squad_data_loss_guards` | `cc9aa0f3a722` | exact | exact | Guard functions/triggers and constraints exist both. | aligned |
| 7 | `20260509055529_harden_chat_thread_summary` | `c77c919b04b0` | exact | exact | Hardened summary function state aligns. | aligned |
| 8 | `20260509230500_schedule_module_database_v1` | `3578dd480f0d` | exact | exact | Schedule tables, constraints, RLS, grants and triggers align; production has extra indexes/policies. | aligned core; supplemental drift |
| 9 | `20260510030705_platform_security_control_plane` | `49a1682591e3` | exact | exact | Permission matrix exists in both; later action constraint now differs. | aligned at application; later production/staging drift must converge additively |
| 10 | `20260511210558_add_scout_role_access` | `16e104f97669` | exact | exact | Permission rows exist both. | aligned |
| 11 | `20260512133000_add_scouting_permission_matrix` | `948debc96c1a` | exact | exact | Scouting permission rows exist both. | aligned |
| 12 | `20260513142629_scouting_database_engine` | `017fa06677c8` | exact | exact | Base Scouting tables/constraints/RLS/grants exist both. | aligned core; policies/indexes have environment drift |
| 13 | `20260513155836_extend_squad_availability_statuses` | `6a098b193562` | exact | exact | Availability constraint state aligns. | aligned |
| 14 | `20260514153000_scouting_source_identity_indexes` | `3946a3aefb7b` | exact, SQL fingerprint differs | exact, SQL fingerprint differs | Source columns/constraints align; index sets differ. Data backfill semantics cannot be reconstructed from the current rows without reading user data. | production/staging drift; unable to prove safely at data-effect level; future additive index audit |
| 15 | `20260514170000_scouting_player_identity_quality` | `a492f8d0450d` | exact | exact | Quality columns/functions/constraints align. | aligned |
| 16 | `20260515045748_platform_identity_foundation` | `27127ac7375d` | exact | exact | Identity tables/checkpoints exist and core shapes align; production has extra indexes. | aligned core; checkpoint row is not evidence that Session Planner row schema was applied |
| 17 | `20260517053640_football_science_db_foundation` | `101f07d8fee2` | exact | exact | FSDB relation shapes/constraints/grants align; index sets differ. | aligned core; supplemental index drift |
| 18 | `20260517140007_relax_fsdb_birth_year_range` | `f722d824927d` | exact | exact | Birth-year constraint state aligns. | aligned |
| 19 | `20260517145000_add_platform_appearance_permission_matrix` | `1f54e082d7a1` | exact | exact | Permission rows exist both. | aligned |
| 20 | `20260517145619_add_transfer_room_permission_matrix` | `1cfe06eab777` | exact | exact | Permission rows exist both. | aligned |
| 21 | `20260517172032_add_gameplan_permission_matrix` | `3e06e77e9d44` | exact | exact | Permission rows exist both. | aligned |
| 22 | `20260520152023_ensure_profile_image_bucket` | `edf8e750f69b` | exact | exact | Public profile-image bucket metadata matches. | aligned |
| 23 | `20260613000100_video_analysis_metadata_foundation` | `dccde142a926` | exact | exact | Base Video tables/constraints/triggers/grants exist in both. | aligned core; policy/index drift tracked separately |
| 24 | `20260614004604_video_analysis_workstation_v2_metadata` | `0b1bb3a05324` | exact | exact | Workstation v2 relations exist; semantic column state aligns. | aligned core |
| 25 | `20260614015506_video_analysis_metadata_hotfix` | `5be0005eedbc` | exact history name; production stores a full 29,629-byte schema reapply | exact history name; staging stores the 640-byte marker | Local file is intentionally only the hotfix marker; final core relations exist. | renamed or superseded migration; retain marker plus this ledger, never infer SQL equality from filename |
| 26 | `20260614163504_idp_player_development_system` | `84d09eb47b83` | exact | exact | IDP tables/constraints/grants align; policies/indexes differ. | aligned core; supplemental drift |
| 27 | `20260614175410_idp_permission_matrix` | `88c56a82031f` | exact | exact | IDP permission rows exist both. | aligned |
| 28 | `20260614222541_video_analysis_coding_button_behavior` | `320a03249b14` | exact | exact | Coding-button columns/constraints align. | aligned |
| 29 | `20260615035024_video_analysis_presentation_builder_v1` | `cf9b0ff42649` | exact, production semantics match expected permission expansion | exact history but older/partial stored SQL | Presentation relations exist both; staging lacks `present`/`share` rows and retains the old action constraint. | migration history exists but expected object differs in staging; future additive convergence required |
| 30 | `20260615223732_video_analysis_smart_collection_sharing_v2` | `23f1cc262a51` | exact | exact | Sharing relations/constraints align. | aligned core |
| 31 | `20260619000100_chat_thread_read_models` | `52875cab7987` | exact | exact | Read-model relation/function present both. | aligned core |
| 32 | `20260621230015_add_idp_development_interventions` | `e6d04d7b7b3d` | exact | exact | Intervention relation/constraints align. | aligned core |
| 33 | `20260622020109_rtp_operating_spine_sprint1` | `b05765c38313` | exact | exact | RTP core relations/constraints/grants align. | aligned core; policy/index drift |
| 34 | `20260622023539_rtp_performance_readiness_sprint2` | `8450bd03bc1e` | exact | exact | Readiness relations/functions align. | aligned core; policy/index drift |
| 35 | `20260623204348_fix_scouting_source_identity_defaults` | `f26205d264a4` | exact | exact | Defaults/constraints align. | aligned |
| 36 | `20260623213000_fix_video_analysis_trigram_indexes` | `61309a44823a` | exact, SQL fingerprint differs | exact, SQL fingerprint differs | Staging has the intended note trigram index; production index set differs and cannot be proven to match both intended rebuilds. | migration history exists but expected object differs; future index convergence |
| 37 | `20260626170000_chat_whatsapp_user_state` | `763fde5bd10d` | exact | exact | User-state relation exists; Realtime membership differs. | aligned table core; Realtime drift tracked with row 4 |
| 38 | `20260627030412_idp_development_goals` | `6ba3462abcdb` | exact | exact | Goal/check-in relations align. | aligned core |
| 39 | `20260627053116_rtp_library_database_api_foundation` | `cd150bfddcb0` | exact | exact | RTP library tables/functions/grants align. | aligned core; index drift |
| 40 | `20260629143000_rtp_exercise_bank_professional_catalog` | `31675a7bc077` | exact | exact | Catalog seed/mapping objects exist; row-effect identity not re-read. | aligned schema; data effect unable to prove safely without a separate content audit |
| 41 | `20260702124301_chat_web_push_notifications` | `276782456a89` | exact | exact | Push tables/triggers/grants align; index supplement differs. | aligned core |
| 42 | `20260713195237_chat_action_items` | `3adfc22b2b88` | exact, one stored statement | exact, thirteen stored statements | Table/columns/constraints/trigger/policy semantics exist in both; index sets differ. | aligned core; stored parser representation and indexes differ |
| 43 | `20260713195408_chat_action_item_fk_indexes` | `e4bb6e10ff5e` | exact, one stored statement | exact, three stored statements | Required FK indexes exist but environment index sets are not identical. | production/staging drift; retain local three-index contract |
| 44 | `20260716234500_rtp_exercise_diagram_media_status` | `e7fb0c1ba86c` | exact | exact | Diagram media columns/function state aligns. | aligned |
| 45 | `20260721153039_platform_app_state_database_source_v1` | `5895f555d826` | `20260721161045` | `20260721153900` | Table columns/constraints/RLS/grants match; production has one extra index and deny policy. | renamed migration; local file is canonical logical source, remote aliases remain historical evidence |
| 46 | `20260721153918_platform_app_state_write_rpc_v2` | `6efb5a8fbc98` | `20260721161059` | `20260721153942` | Function signature/definition and grants match. | renamed migration; map aliases, do not repair remotely in this phase |
| 47 | `20260722202605_session_planner_domain_records_v1` | `db49ba366fbe` | absent | absent | Four `session_planner_*` relations/functions/policies/triggers are absent both. Only the older planned checkpoint exists. | local-only and intentionally unapplied; do not apply before the offline/backend contract gate |
| 48 | `20260810214000_add_set_pieces_room_permission_matrix` | `b5fb987ce131` | absent | absent | All seven `set-pieces-room` permission rows are absent both. | local-only and unexpectedly unapplied; module owner must decide future additive rollout |
| 49 | `20260824212110_video_analysis_elite_workstation_foundation` | `9036911fe894` | absent | absent | New timeline/collaboration/operation relations and functions are absent; touched legacy Video objects alone do not prove application. | local-only and intentionally unapplied |
| 50 | `20260824233000_video_analysis_tracking_telestration` | `3a23d68bda75` | absent | absent | Object-track, correction, and dynamic-graphics relations are absent both. | local-only and intentionally unapplied |
| 51 | `20260825000500_video_analysis_pitch_calibration` | `01e3f636f38b` | absent | absent | Calibration relations/indexes/triggers are absent both. | local-only and intentionally unapplied |
| 52 | `20260825005720_video_analysis_portable_media` | `c085fdd0f626` | absent | absent | Portable-media relations/indexes/triggers are absent both. | local-only and intentionally unapplied |
| 53 | `20260825013000_video_analysis_media_production` | `570d759231eb` | absent | absent | Media-angle and export-manifest relations are absent both. | local-only and intentionally unapplied |
| 54 | `20260825014500_video_analysis_intelligence_facts` | `6b4033006faf` | absent | absent | `video_clip_analysis_facts` view is absent both; note index state also differs. | local-only and intentionally unapplied |
| 55 | `20260825024500_medical_sync_event_projection` | `a5c8f544dc0b` | `20260825030203` | `20260825024501` | Table columns/constraints and all five function definitions/grants match; production has extra indexes/deny policy. | renamed migration; canonical SQL content is aligned |
| 56 | `20260825043000_video_analysis_freehand_telestration` | `d7675fbfb9d0` | absent | absent | Intended `duration_ms`/`layer_text` columns already exist from earlier Presentation Builder definitions. | renamed or superseded migration; no history repair justified |
| 57 | `20260825181453_leaderboard_foundation` | `c4e719b1fc76` | exact | `20260827051639` | Five tables, column/constraint/trigger/function definitions and server-only grants match; production has extra FK indexes and deny policies. | environment-specific renamed migration; core aligned, supplemental drift |
| 58 | `20260825224516_scouting_dataset_versioning` | `7124e50abd5c` | absent | absent | Six dataset/import relations, five RPCs, import bucket and upload policy are absent both. | local-only and intentionally unapplied |
| 59 | `20260826074859_video_analysis_tracking_correction_idempotency` | `174b4606a1cf` | absent | absent | Parent `video_track_corrections` relation is absent both, so operation-ID column/index cannot exist. | local-only and intentionally unapplied |
| 60 | `20260829015714_leaderboard_active_coach_identity_repair` | `4049026a85c4` | exact | absent | Production history records the data repair; staging has no history. Row intent/effect was not re-read. | environment-specific migration; staging unexpectedly unapplied or intentionally inapplicable—unable to prove safely without owner decision |

## Recommended trusted baseline

No current source is sufficient by itself:

- local Git is the canonical reviewed SQL source but contains eleven intentionally/unintentionally unapplied files and one hotfix marker that is not the production SQL body;
- production is closest to operational truth but contains untracked RLS automation, advisor indexes, deny policies, and production-only repair history;
- staging contains a broad executable Chat write function not represented in Git, an older permission constraint, missing Video permission rows, and different Realtime membership.

The future trusted baseline should therefore be a reviewed **logical migration ledger** committed to Git, not a count or blind copy of either remote history. It should:

1. preserve all existing local files and SHA-256 values without rewriting applied history;
2. map the four timestamp-aliased logical migrations to their production and staging versions;
3. mark the eleven staged files explicitly `unapplied` with an owning module and rollout decision;
4. record the hotfix marker's production stored-statement fingerprint separately;
5. introduce future additive convergence migrations for permission actions/rows, Realtime membership, required trigram/FK indexes, deny policies, and any accepted RLS event-trigger strategy;
6. separately review and either remove or formally source-control staging's `upsert_chat_read_receipt` function;
7. reconcile the production-only active-coach repair through business evidence, not by copying user rows;
8. verify a clean, isolated database replay against catalog fingerprints before any migration-history repair is considered;
9. use migration repair only after the ledger and clean replay prove equivalence, under separate explicit authorization.

Until those steps are reviewed, no new synchronization migration or real offline backend contract may be introduced.
