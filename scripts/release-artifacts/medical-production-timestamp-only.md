# Medical production timestamp correction — prepared, not applied

Owner: System / Security; Medical retains clinical writes/rules and Sessions is
only a consuming view. Target on release: `bustidorxevacosqhkcz`. This is a dormant
artifact outside tracked migrations, never part of a broad database push.

The SQL replaces only `app_private.medical_compat_entity_timestamp(jsonb)` with
the definition accepted in staging. It removes activity date from mutation-order
comparison. No row/revision/event is repaired, replayed or deleted. The public
projector, plan functions and constraints already match production and stay intact.

Seven function definitions and execution privileges must match the inspected
production baseline. Missing dependencies, drift, elevated execution, widened
client grants and reapplication stop the artifact. The final timestamp definition
must match staging MD5 `5219258aef9bc1859efa4fe5ca5223d3`.

Execute all SQL in ONE transaction through the reviewed migration executor only
after explicit production release authorization. The file uses transaction-local
5-second lock and 30-second statement timeouts. Do not execute individual statements
in autocommit. Recheck project identity, exact source SHA, schema fingerprint,
backup/readiness and release traffic immediately before application. Record the
migration version and artifact SHA-256. Preserve the prior definition for diagnosis;
do not automatically roll back to its known future-date defect or restore old data.

The native test now rehearses both the August staging alignment and the September
production-equivalent definition baseline on an isolated PostgreSQL 17 database.
It reproduces the old future-date defect, refuses baseline/permission drift,
checks unchanged historical rows/revisions/pending events and unrelated definitions,
then tests recommendation/plan projection, retry, stale writes, unknown age and
archival. No production data or credentials enter the native job.

The optional manually dispatched `Medical Projection Native` production-mode job
runs `scripts/verify-medical-production-mode.mjs` with an exact expected Live SHA.
It checks the production backend/build before login, reads GET /api/medical,
rechecks identity and revokes only its new QA session. It never POSTs to Medical,
reads clinical content, creates fixtures, changes environment variables or deploys.
Its output contains only build/backend identity and mode/enabled. Missing credentials,
identity mismatch, invalid capability or failed session revocation fail the check.
A legacy result is reported honestly and requires separate scope review before
any change to that mode.

Local probe tests (9) and qa:static passed. Final native run `41104534931` passed
all 37 tests at source `e7049963a15af72be0685c4274e692494c07757d`. The production-mode
job `124228575337` in run `41104063540` verified `database` / enabled `true` on Live
build `845a0ed95bbd8795bf574a8aeb0c9f37ed903250` and revoked its own QA session.
That run's original native tests failed on their suppressed-error-text assertions;
the separate final native run uses SQLSTATE and is the passing installation proof.

Artifact SHA-256: `6b7619eb9b4901cecea2913b259372716e8c85de060d81d3022d8ba36864d7a2`.
Prepared and tested, not applied to production. Full evidence:
`docs/architecture/MEDICAL_PRODUCTION_COMPATIBILITY_2026-10-30.md`.
