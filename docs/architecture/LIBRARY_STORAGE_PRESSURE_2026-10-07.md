# Library storage pressure: preserve recovery, stop redundant copies

Task/release owner: System / Security, assigned by the user in this chat.
Affected module owner: Exercise Library (backup serialization boundary only).
Platform Shell consumes the read-only storage diagnostic. No clinical, exercise,
folder membership, permissions, database or server merge rules change.
Operating model: distributed-specialist-v4. Isolated candidate starts at
7578164bec91767e41f50e2cef5a695ebb100ca8 on codex/library-cache-pressure-20261007.
No active overlapping implementation was visible in the available thread status.
The unrelated root working tree remains untouched.

## Evidence and limits

The authenticated live Storage health dialog measured about 8.00 MiB of native
localStorage (UTF-16 estimate, not a quota measurement). Exercise Library and
Exercise Library Backup were about 2.53 MiB each; Player Profiles about 1.32 MiB.
The browser origin estimate was about 72.15 MiB. These are different storage
measurements, not evidence that 72.15 MiB of snapshots exists.
Two current-scope pending module markers were present. Those are neither edit
counts nor proof of local durability. No native data was cleared or modified by
the diagnostic. IndexedDB review archives remain unmeasured.

Equal sizes do not prove equal payloads, central acknowledgement, safe deletion,
or which copy contains unique pending work. The deployed diagnostic could not
compare contents. A new read-only comparison reports equality or uncertainty,
counts only, and no exercise content, identifiers, keys or exception strings.
The comparison rechecks both native values to reject observed concurrent changes;
it is a point-in-time diagnostic, not an atomic migration precondition.

Code inspection found two avoidable amplifiers:
- Every library/folder backup save assigns a fresh savedAt even for unchanged
  normalized content, making a new protected value that can queue central work.
- Every data-safety snapshot appends another complete snapshot and replaces latest,
  even if all recoverable content is identical. Identical saves can displace
  useful history under the existing 30-snapshot retention policy.

## Candidate

Unchanged library/folder backups retain their exact previous representation,
including save time and any additional envelope metadata. Actual content changes,
missing or invalid backups still use the existing complete backup format.
The native storage write remains mandatory: a bridge read can be memory-only.
Quota failure therefore still returns backupSaved false and preserves the prior
native value. Failure to save the primary value does not rewrite its backup.

Data-safety read/compare/write happens inside one IndexedDB readwrite transaction.
Deduplication requires matching schema, app, stored values, recovery copies,
recovery separation, recovery metadata, capture scope and protected save generations
in both latest and its history row. A small additive saveContext field records
fixed ownership/revision/generation fields, including pending deletions without a
native value. Unrelated manifest metadata is excluded. This is recovery evidence,
not authorization to replay a snapshot into the active scope.
Legacy pointers without a verified history reference create a normal new copy.
Aborted transactions never report success; writes to both stores roll back.
Concurrent identical callers create one consecutive snapshot. New recovery state
creates a new snapshot even when ordinary module values match. An unchanged
snapshot retains its real original timestamp in the save status.
No new store, database version, compressed encoding, snapshot deletion rule,
protected-key removal or live data migration is introduced. Existing readers and
rollback builds can still read the same complete snapshot and library formats.
The existing retention policy only runs after a new distinct snapshot is written.

## What this does not solve

This candidate prevents redundant future writes and snapshot growth. It does NOT
free the existing 5.06 MiB in native localStorage, migrate the library to IndexedDB,
prove every central write, or resolve Sessions local review. Do not represent it
as a completed full-cache fix.

Moving/removing a protected native backup requires a separate migration boundary:
1. Classify ownership, pending generation, central revision and exact native copies.
2. Commit and re-read the entire original payload plus recovery metadata in durable
   storage that normal snapshot rotation cannot prune.
3. Prove existing readers, offline/restart recovery, export/restore and rollback
   can retrieve that payload before changing the native representation.
4. Handle older tabs and concurrent writes; a localStorage read-then-remove is not
   an atomic compare-and-swap and is not an acceptable migration guard.
5. Preserve both differing versions. Fail closed on full/unavailable IndexedDB,
   scope drift or uncertain acknowledgement. Never clear browser storage wholesale.

The safe next product decision is a scoped migration of the backup storage path,
not a blind cache clear or another full offline rollout. This candidate is local
until a new direct Deploy safe command; the previous authorization covered PR261.

## Validation

- A synthetic comparison against released controller source reproduces a changed
  backup value for an unchanged save; the candidate preserves the exact bytes.
- Full local QA before the final save-context addition: 3,906 passed, three existing skips.
- Final save-context changes: 80 focused contracts and six WebKit checks passed,
  including differing scopes/generations, metadata privacy, quota failures,
  concurrent identical snapshots and rollback of an interrupted transaction.
- Static/security/storage/performance/architecture gates passed on the final code.
- Exact-commit full GitHub QA is required before declaring the candidate ready.
- The first focused fixture used a noncanonical timestamp and triggered an ordinary
  folder normalization write; the fixture now uses the app's ISO timestamp format.
  No assertion was weakened. Live data was neither read through a new API nor changed.
