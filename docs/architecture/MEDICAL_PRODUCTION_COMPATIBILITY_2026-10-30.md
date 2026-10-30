# Medical production compatibility review — 2026-10-30

Owner: System / Security for this bounded saved-work task and release preparation.
Medical owns clinical rules/writes; Sessions consumes Medical's public read contract.
This is a completed read-only compatibility review, not production release approval.
No production data, schema, environment setting or deployment was changed.

## Decision

Do not copy the staging database alignment to production. Production already has
its projector, plan helpers and event constraint. Only the inspected timestamp
helper differs within this projection contract. Prepare a separate, definition-only,
fingerprint-guarded correction for that helper, rehearse it against the observed
production baseline, and verify the authenticated runtime capability before release.
The existing staging SQL intentionally rejects production's newer baseline.
A frontend deploy alone would leave the timestamp defect in the database.

## Verified identities and scope

- Production and remote main: `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`.
- Production public endpoint: HTTP 200, backend `bustidorxevacosqhkcz.supabase.co`.
- Reviewed candidate: `578c8b6668c74bb56e637bebc0d19dee97564d80`, clean and
  matching its remote branch `codex/medical-recommendation-journey-20261029`.
- Staging build: `dpl_EiWkM8G5aQp2AC5eVxUyjFUzkV2U`, backend
  `pokrksgempkuraueglpu.supabase.co`; previously accepted product source
  `d1e9374df42e0d792ae49a245098df735e6d9821`.
- Candidate adds four runtime file changes: Medical bindings, workspace renderer,
  Medical state service, and central-sync runtime. Other changes are targeted
  QA, staging workflows, dormant release artifacts and evidence documents.
- No candidate changes to API sources, tracked Supabase migrations, dependencies,
  production deployment workflow or Sessions implementation versus current Live.
- Root workspace has unrelated Video/Supabase changes; it was inspected only.
  All candidate work remains isolated. Draft PR: #293.

## Database evidence

Read-only catalog queries compared definitions, signatures, grants and constraints
on both explicitly named projects. Fingerprints are definition comparison evidence,
not a substitute for behavioral tests or a complete database/security audit.

| Function | Production MD5 | Staging MD5 | Result |
| --- | --- | --- | --- |
| public.project_medical_state_sync_events(uuid[]) | 462d583bb2028f79fa3f199e99ad3107 | same | Match |
| app_private.validate_medical_compat_plan(jsonb) | d47a621ab7fc46a74f3116f3e29b2848 | same | Match |
| app_private.upsert_medical_compat_plan(jsonb,jsonb) | affc1a542729c3f93a324de792036a74 | same | Match |
| app_private.validate_medical_compat_record(jsonb) | ab93098ee063878cdc8810fc0796066a | same | Match |
| app_private.upsert_medical_compat_record(jsonb,jsonb) | 2c5eca6f4ca8a592436cb27947a10f67 | same | Match |
| app_private.archive_medical_compat_record(jsonb,text,text) | bca261764b94315c173d1ac8c1275c7d | same | Match |
| app_private.medical_compat_entity_timestamp(jsonb) | 2d80a598eee0c4f64b1ecaa9231961b9 | 5219258aef9bc1859efa4fe5ca5223d3 | Correction required |

All seven inspected functions use invoker security, allow service_role execution
and deny anon/authenticated execution. Event type and processing status constraints
match, including medical-board-updated. Production migration history confirms
medical_plan_canonical_projection at `20260901114401`; staging's August-baseline
installation must not replace it or replay its historical repair section.

A SELECT-only call with literal synthetic JSON demonstrated the semantic difference:
activity date `2099-01-01`, updates at `2026-10-30T10:00:00Z` and `11:00:00Z`,
archive at `12:00:00Z`. Production returned `2099-01-01` for all three;
staging returned the three actual mutation timestamps. A date-only object returned
`2099-01-01` in production and an empty unknown-age value in staging.
No real clinical content was read or changed for this probe.

This makes different writes compare equal and can suppress an archive before its
activity date. Record upsert, plan upsert and record archival use this helper.
The replacement already passed native PostgreSQL future-edit/archive tests in
staging preparation; the production-specific installation path still needs rehearsal.
This defect does not explain or close the broader cache-capacity investigation.

## Runtime configuration: outstanding evidence

Vercel metadata, read through the documented CLI fallback after connector HTTP 403,
confirms MEDICAL_STORAGE_MODE exists for production as a sensitive variable and
for the staging branch as a separate preview variable. No other Medical mode
fallback variable was present in that project inventory. No values or secrets
were printed or downloaded. No configuration was changed.

Presence is not runtime proof. The current production value and authenticated
Medical status response were not verified in this review. The existing signed-in
browser was observed on Home only, without navigation, reload or edits. Its login
and production client-config response do not establish canonical Medical mode.
Before release, obtain the authenticated Medical status response for the exact
production build and record only mode/enabled. If it is legacy, enabling database
mode is a separate behavior change requiring explicit scope and validation; do
not silently switch it to match staging. Do not run the fixture-writing staging
acceptance harness against production.

## Concrete preparation and release order

1. Prepare a dormant SQL artifact that changes only the timestamp helper. Guard
   the seven observed function identities/definitions and relevant execution grants;
   fail if the baseline has drifted. Keep invoker security and restricted execution.
   Use a transaction and bounded locks; include no row rewrite, event replay,
   broad migration push, constraint replacement or historical repair.
2. Rehearse that exact artifact on native PostgreSQL with the production-equivalent
   September projector plus old timestamp helper. Prove installation leaves stored
   values/revisions/events untouched; reject drift/reapplication; verify grants,
   future edits, stale edits, archive, retry/idempotency and unknown timestamps.
   This installation test is additional to the already passed staging acceptance.
3. Resolve the runtime capability evidence above. Recheck live/main SHA and isolation
   just before release; the current findings are a snapshot, not a permanent permit.
4. After direct user production authorization, use the owned Safe Lane and shared
   release traffic guards. Apply only the reviewed helper correction to the exact
   production project, verify its definition/grants, then ship the clean candidate
   through the official release flow. Release owns current backup/readiness gates.
5. Verify the deployed SHA, backend isolation, authenticated mode, production smoke
   and non-destructive saved-work reads. Do not claim the four staging write/fault
   scenarios have also been exercised on production.

Rollback must not restore old user data or replay events. The helper preserves
its signature and schema contract; frontend rollback can retain the corrected
helper. Keep the prior definition as diagnostic evidence, but do not automatically
restore its known timestamp defect. If a database rollback is actually needed,
stop for a reviewed forward correction or explicitly authorized rollback.

## Scope still open

Production-specific SQL artifact/rehearsal and runtime evidence are not complete.
The broader platform remains unapproved for sustained concurrent writers, true
offline cold restart, exhausted disk quota, bounded storage growth, all Medical
form variants and all other modules. Staging success establishes the documented
Medical recommendation journeys only. See
[the staging evidence](MEDICAL_RECOMMENDATION_JOURNEY_2026-10-29.md).
