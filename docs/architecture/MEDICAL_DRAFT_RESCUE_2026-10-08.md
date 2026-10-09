# Medical quota rescue: a bounded durable copy and authorized review

Task owner: System / Security for the failed-save boundary. Affected owners:
Medical (clinical state and access), Platform Shell (save status and storage
inventory). No clinical merge, permissions, central API or Sessions ownership is
transferred. Candidate follows PR #268; it is not a production release.

## Problem and decision

The synthetic full-app probe proved that Medical's quota fallback could queue the
new serialized state in memory while the next durable whole-browser snapshot
contained the previous stored value. With rejected central writes, reload lost
access to the new draft. This does not establish the cause of the historical Ella
incident, nor certify all offline saving.

On a Medical clinical write that throws a localStorage quota error, preserve the
exact serialized draft and previous value independently of central queue
acceptance. Successful normal writes and view-only changes do not create rescue
copies. Existing central saving continues through its existing guarded path.

The alternate store is a rescue journal, not another source of clinical truth.
A read-only Medical panel lists authorized copies, opens their retained content,
and exports the complete envelope. It never replaces the active editor, submits
central work, merges records, deletes generations, or claims a server receipt.
This is useful recovery access, not an automatic conflict-resolution flow.

Alternatives rejected: relying on a rotating snapshot of old cache; immediately
replaying a full Medical state after login; treating an IndexedDB request callback
as proof of transaction commit; clearing all storage to make the write succeed.

## Storage and access contract

- Dedicated `football-science-medical-drafts-v1`, version 1: immutable payloads in
  `drafts`, small list metadata in `catalog`. Both writes use one transaction.
- New immutable UUID per distinct envelope; SHA-256 fingerprint locates exact
  repeats. A repeat also checks the actual payload before returning confirmation.
  The digest is not an authentication or authorization token.
- Envelope retains exact value, previous value, principal scope, created time and
  the observed hydrated revision (null if unknown). That revision is diagnostic
  context, not permission to replay, and is not asserted to be a proven merge base.
- The existing read scope includes user, organization, club, team and role in
  authenticated mode. Existing Medical edit permission and bridge write-role
  permission must both hold. Unknown scope and coach projection fail closed.
  Medical also supplies the scope recorded when its state was read; an old
  in-memory state cannot be relabeled for a newly active account during capture.
- Access is checked before capture, after asynchronous reads and at each view or
  download action. User-change events clear the displayed content immediately.
  A late commit remains owned by its original scope and cannot confirm saving to
  a different current user. Browser access guards are not encryption at rest.
- Success is reported only from transaction completion. Abort, quota, incompatible
  schema, unavailable IndexedDB and bounded-operation timeout are unconfirmed.
- A later failed generation cannot be hidden by an older successful callback.
  Every newer clinical save also supersedes older rescue status callbacks, so a
  late rescue result cannot reissue an error after a normal successful retry.
  PR #268's scoped error handling remains a prerequisite for the global indicator.
- Maximum 128 distinct copies and approximately 32 MiB serialized UTF-16 payload
  per browser origin; at most 8 MiB per envelope. Metadata/index overhead is extra;
  these are application safety limits, not a browser quota claim. At capacity the
  next distinct copy fails visibly. Identical retries consume no new generation.
  Earlier copies are never pruned. Limits apply across owners, without displaying
  another owner's details.
- List reads fetch metadata only; opening a selected copy fetches that payload.
  The Medical table is a preview (up to 200 recommendations); full retained state
  is available in the expanded content and download. All values use text nodes.
- Storage Health includes payload and metadata usage. It exposes aggregate counts
  and sizes, not names, clinical content or account identifiers.

## Acceptance evidence

All browser data is synthetic. Local results are recorded in the candidate's PR.
Coverage includes exact recovery after reload with local quota and central 503;
read-only review and exact export; central state remaining unchanged; two writer
variants; deduplication; capacity limits; transaction abort after request success;
unknown ownership; account/team/logout/permission changes; late completion under
another account; later failed versus earlier successful generations; and storage
inventory without clinical data. Chromium and WebKit exercise real IndexedDB.
Existing central-revision and Medical saved-visibility tests guard the untouched
central protocol and Sessions consumption.

## Limits and remaining gates

- This protects the inspected quota fallback. It is not universal offline editing,
  protection for every error type, every partially filled form, or every module.
- Closure before transaction completion remains unconfirmed. Completed IndexedDB
  writes survive tested reload; browser eviction, private-session teardown, disk
  loss and user-cleared site data are not covered by that claim. No persistent
  storage permission is silently requested or claimed.
- Offline access uses the platform's existing authenticated principal/permission
  state; no client can discover a new server-side revocation while disconnected.
- A lost server receipt does not retire or replay the rescue copy. Recovery review
  can therefore show already-saved content. Generation-specific reconciliation,
  useful clinical diffs, explicit resolution and safe retirement need a separate
  Medical-owned gate before calling the offline workflow complete.
- The bound prevents unlimited new rescue growth but can be reached. It does not
  solve whole-platform cache management forever. Never advise clearing these
  unresolved copies as ordinary cache cleanup.
- Rollback to code before this change ignores the new database and leaves it
  untouched, but removes this UI and stops creating new rescue copies. Retained
  content becomes accessible again when compatible code returns; old code must
  not be described as providing this protection.
- No real clinical content was read, modified, replayed or deleted for this work.
  No database migration, staging deploy, main integration or production release is
  part of this candidate. A new direct release instruction is required.

## Local validation record

- Final targeted contracts: **223 passed** (Medical state/composition/rendering,
  data-safety runtime and central sync).
- Final rescue browser matrix: **24 Chromium + 24 WebKit passed**.
- Existing compatibility coverage: **115 Chromium passed** during integration
  (central revisions, Medical visibility, error isolation, inventory and the then
  17-case rescue matrix); final store refinement additionally passed all four
  inventory cases. WebKit additionally passed six Medical/Sessions visibility
  cases and four inventory cases. These overlap; do not add them as unique tests.
- Final `npm run qa:static`: passed, including syntax, local-isolation, storage,
  security, migration-contract, performance and architecture checks. The existing
  84 oversized-module warnings are unchanged.
- Both old-result/new-normal-save regression cases failed before the generation
  fix and passed afterward. The original full-app memory-only probe is documented
  in `MEDICAL_DURABILITY_NEXT_GATE_2026-10-08.md`.
- The actual Medical recovery panel was visually inspected from a synthetic
  full-app screenshot. No production browser or clinical data was used.
