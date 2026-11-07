# Independently bounded storage inspection

Owner: System / Security. Affected boundary: shared Storage health diagnostics.
Base: `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`.
Branch: `codex/storage-scan-isolation-20261027`.

## Problem and decision

The scanner previously stopped its whole database transaction when any store
consumed the shared row or byte allowance. A large snapshot could therefore hide
small pending/review records in other stores. The `latest` store also contains
both a large latest cache row and Sessions work; lexical cursor order visited the
cache first. Reordering stores alone would not solve that second boundary.

Divide the existing database row and approximate-byte allowances equally across
its present known stores. Count every store first, then inspect within each share.
A row/byte limit ends only that store's cursor. Other stores retain their reserved
allowances. All reads still use one read-only transaction per database, preserving
a coherent view; the database timeout, missing-database upgrade abort and unknown
count behavior remain in place.

In `latest`, use a key cursor and fetch individual work rows. Defer only the exact
`latest` cache key until all other keys have been examined, and fetch its value
only if that store still has budget. Unknown work rows are still read/classified
rather than silently filtered out. No payload, identifier or raw storage error
appears in the returned aggregate report.

The dialog reports each store's inspected/total rows and complete/partial status.
A partial store keeps the database and top-level report incomplete even if the
read-only transaction itself finishes normally. A fully inspected store is not a
claim of local durability, central acceptance or safe deletion.

## Bounds and limitations

- Defaults remain 3,000 rows and approximately 100 MiB serialized UTF-16 per
  database, now reserved across present known stores. Unused shares are not lent.
  A busy store may therefore inspect fewer rows than before, explicitly partial.
- As before, a value must be materialized/serialized before its size is known.
  Each store can exceed its approximate byte share by its last inspected row.
  This is not a strict allocation/memory limit; synchronous serialization can
  also delay timer delivery. No larger global limit is introduced.
- Storage errors, version changes or the database timeout can still end the
  database-wide transaction. Store isolation applies to row/byte exhaustion,
  not to a promise of success after an IndexedDB transaction failure.
- Known stores only; absent/missing/failed stores remain absent or unknown.
  No schema upgrade is committed, and no cache, journal or history is deleted.
- This does not change saving, replay, permissions, cache retention or review
  resolution. It does not prove that a production device scan will finish.

## Validation

Two deterministic regressions failed before the change: oversized snapshot data
hid review/operation groups, and a large latest cache hid Sessions groups. Both
pass with the correction. Additional cases cover reserved row limits, a deferred
cache that is never fetched after work exhausts its share, and complete work
stores alongside an incomplete history store in the dialog.

Existing tests verify byte-identical retained data, read-only transaction modes,
absent/concurrently removed databases, unknown failed counts, denied/timed-out
enumeration, no private payloads in output, and the real app's diagnostic flow.
Local validation: `npm run qa:static`, `git diff --check`, 3 API contracts,
14 Chromium cases and 14 WebKit cases passed (31 cases total).

All fixtures and numerical examples in this candidate are synthetic. No measurements
from an authenticated user's device are included or uploaded. Such measurements
remain outside this repository. Separate deployment and production verification
are required before repeating a real-device check with this implementation.
