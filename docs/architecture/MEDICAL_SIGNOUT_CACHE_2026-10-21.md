# Medical cache reads after sign-out — 2026-10-21

Owner: System / Security. Affected boundary: Medical's central browser cache.
Risk lane: Safe. No database schema, server writes, auth claims, or saved-copy deletion changes.

## Release finding

Safe Lane on candidate 2614a484 stopped before staging/main/production twice:
- The first run paused for approximately 34.7 hours within a browser click and
  timed out in an unrelated video test. That test then passed three isolated
  repetitions and the next complete run. No video source/test changes were made.
- The uninterrupted run passed 4,122 tests with three skipped, but failed the
  existing deferred Medical read after sign-out test. The private response was
  rejected and disk draft/revision preserved; the cache view was nevertheless
  repopulated with the default roster instead of remaining inaccessible.

## Cause and correction

The cache reader guarded foreign scopes and pending recovery generations, but
an entry without a read scope could remain readable after sign-out. Late render
or initialization callbacks can populate such an entry. Clearing the cache once
at sign-out therefore does not enforce the read boundary.

Both Medical cache-read entry points now deny access whenever the current read
scope is empty. They return an empty, non-durable, non-server-backed, non-editable
view. Existing local copies are not deleted, and authorized scope handling stays
on the existing path. This protects the read boundary independently of callback
ordering or cache source labels.

Two deterministic tests reproduce a late local-write and a late readonly-baseline
projection after sign-out. Both fail before the fix. The original deferred-read
assertion is unchanged. Focused validation also covers token refresh, organization
change, reloading, and a newly authorized edit without adopting another actor's
draft. Full Safe Lane validation remains required before release.

Validation before candidate push: 36 repeated scope/sign-out/token/authorization
checks plus 40 Medical visibility/recovery/working-draft tests pass.
`npm run qa:static`, syntax validation and `git diff --check` pass.
