# Medical staging projection alignment

Owner: System / Security for staging acceptance readiness. Medical retains clinical
rules and writes; Sessions is only a reader. Target: staging project
`pokrksgempkuraueglpu`, never production.

Read-only inspection on 2026-10-29 found the August recommendation projector but
no plan helpers or September migration. The staging event constraint also omits
medical-board-updated. The API currently projects these plan events, so simply
enabling MEDICAL_STORAGE_MODE would leave part of Medical broken.

The adjacent dormant SQL contains the definition-only section of
20260901103202_medical_plan_canonical_projection.sql. It omits all historical row
repair and event replay. A fingerprint guard rejects any projector other than
the observed August definition, and existing plan helpers stop installation.
It also fixes the existing version helper: an activity date is not a write timestamp.
The native rehearsal exposed that a future recommendation could report an archive
as stored while silently leaving it active. Comparing activity dates also made
older/newer edits for that future day compare equal. The helper now compares only
write metadata; a missing write timestamp stays unknown rather than borrowing the
activity date. An exact helper fingerprint protects this additional replacement.
No existing row is rewritten, and clinical participation rules are unchanged.

It adds the current event constraint and plan functions while retaining invoker
security and service-role-only execution. Existing records, revisions and events
must be identical before and after installation.

Before applying: native PostgreSQL acceptance must pass; inspect exact staging
project and clean candidate SHA; check release traffic; retain the previous
projector definition and schema state. Apply only these exact reviewed SQL bytes
as a separately named staging migration, never a broad db push. Record the
server-assigned migration version and content fingerprint. Verify unchanged
content and correct grants/functions before setting the staging branch-only
MEDICAL_STORAGE_MODE=database config variable. Production and unscoped preview
settings must remain unchanged. Use the existing guarded staging deploy and
rerun all four Medical journey cases against its exact build ID.

The native test covers installation without rewriting history, rejection of a
changed baseline, denied client roles, recommendation retry, stale edits on future activity days, archival before the
activity date, all six plan event
types, archival and invalid payload refusal. This does not certify tenant
isolation changes: the existing compatibility projector still uses the global
app-state row, as does this unchanged contract. No broader schema rewrite is
included.

## Staging installation evidence — 2026-10-29

- Reviewed candidate: `33161aae87d0f18f3a347a0662cd103d52c818bd`.
- Native PostgreSQL 17 rehearsal: GitHub run `40919578788`, passed.
- Local `npm run check`, `npm run qa:static`, syntax and diff checks passed.
- Clean candidate matched its remote SHA; release traffic guard passed.
- Applied only to `pokrksgempkuraueglpu`, migration `20261029171642`, name
  `medical_projection_forward_only_staging_alignment`.
- All 8 app-state rows had identical before/after content fingerprint
  `e2f99e08d4acddfa207d32cad8bcce16`; event count remained zero and fingerprint
  `d41d8cd98f00b204e9800998ecf8427e` unchanged.
- Projector definition MD5: `462d583bb2028f79fa3f199e99ad3107`.
- Timestamp helper MD5: `5219258aef9bc1859efa4fe5ca5223d3`.
- Plan validator/upsert MD5: `d47a621ab7fc46a74f3116f3e29b2848` /
  `affc1a542729c3f93a324de792036a74`.
- All four functions retain invoker execution, service-role access, and denied
  anon/authenticated execution. Security advisors retained the existing findings:
  65 informational service-only RLS tables and the existing password-protection warning.
- Original schema definitions retained locally in private temporary evidence files.
- This artifact is now applied in staging only. Its exact-old-schema precondition
  intentionally rejects reapplication. Do not put it into a broad production migration.
- Staging deployment and all four real browser cases subsequently passed for
  product source `d1e9374df42e0d792ae49a245098df735e6d9821`; see
  `docs/architecture/MEDICAL_RECOMMENDATION_JOURNEY_2026-10-29.md`.
- Production compatibility was reviewed separately on 2026-10-30. Production
  already has the plan projector/helpers and requires only the timestamp helper
  correction; this staging artifact must not be applied there. See
  `docs/architecture/MEDICAL_PRODUCTION_COMPATIBILITY_2026-10-30.md`.
