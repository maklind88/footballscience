# Medical Note Permission Repair

Owner: System / Security. Affected domain: Medical. Risk: Safe Lane.
User authorization: apply the database correction to staging and production,
then verify Live. No application deployment or coaching-data restoration.

## Diagnosis

Production Monitor 35922701691 and production verification 35930920386 both
reported raw-note HTTP access where denial was required. The former preceded
the saving release. Read-only catalog inspection confirmed authenticated
table-level SELECT on both Medical availability tables in production; staging
retained the reviewed column-only grants. The actor/time causing the drift is
not established. This evidence does not establish that clinical data was read.

The existing views, private accessors, RLS policies and service-role privileges
match between environments. The forward migration restores only the original
20260911185738 safe-column contract. It changes no rows, writers, policies,
views, functions, defaults, central-state source or offline storage.

## Validation And Rollout

- Native PostgreSQL: 53/53, including synthetic broad-grant reproduction,
  aborted-transaction rollback, idempotency, missing-prerequisite rejection,
  team/sharing/role checks, legitimate server writes, content digests and
  backup/restore/restart.
- Targeted API contracts: 30/30. `qa:static` and diff-check passed.
- Capture metadata fingerprints and aggregate row counts before/after each
  remote apply; never export clinical contents for this correction.
- Apply the exact migration to staging first. Require the authenticated
  staging zero-row HTTP boundary probe before production.
- Apply only the same correction to production, then require Production
  Monitor: auth, isolation, backup/restore readiness and authenticated smoke.
- Preserve canonical migration history only after exact stored SQL verification.

The transaction has 3-second lock and 30-second statement limits. Any failed
precondition/postcondition rolls it back. After success, use a reviewed forward
correction, never restore unsafe broad grants as routine rollback. No data
restore is necessary. Remote completion must be reported separately; local
tests alone do not prove a successful production correction.
