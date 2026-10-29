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
