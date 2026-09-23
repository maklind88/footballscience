# Sessions sync incident: 2026-09-10

Owner: Sessions. Shared boundary: central sync / app-state API (System/Security).
Risk: Safe Lane. Candidate only; no production mutation or release performed for this fix.

## Confirmed evidence

- Production app-state POST logs contain repeated HTTP 413 body-too-large failures.
- The Sessions source was not empty: 86 date entries and 260 blocks were present when inspected.
- The stored Sessions value was 3,716,391 UTF-8 bytes. Its JSON storage envelope was already approximately 4 MiB, leaving no room for growing plans and request metadata.
- The user reported entering training on September 9 for September 10. September 10 was absent from the inspected central Sessions value. Its recovery is NOT confirmed.
- The authenticated UI showed empty Sessions while central data existed; it also showed a sync error and later `Local changes need review`.
- Local reproduction: an evicted Sessions cache with a pending sync manifest skipped authoritative hydration and displayed no saved blocks. The exact contents of the user's pending browser snapshot were not inspected.
- Backup object metadata confirms backups exist. Their contents have not been used to restore September 10. No cache clearing, historical overwrite, restore, or production write was performed.

## Candidate changes

1. When pending local Sessions data is missing from the browser cache, retain a server-backed view-only baseline in memory. Do not resolve the pending manifest, replace an existing local edit, or persist this baseline as a local edit.
2. Automatic retry must not send that baseline as the missing pending write. Repeated hydration must not acknowledge it as saved either.
3. Use opt-in `gzip-base64-v1` transport for large Sessions values in both reads and writes. Stored JSON, field timestamps, permissions, revision comparisons, deletion tombstones and merge rules remain unchanged. Other modules and legacy clients keep their existing transport.
4. Bound request bytes, decoded bytes and compressed replies. Malformed or over-limit transfers fail without being treated as saved. Prepare the reply before the database write to avoid a post-commit size failure.
5. Preserve an unresolved scoped quota snapshot in a separate review copy before later edits can replace the active quota snapshot. Do not automatically apply an older revision.

Vercel limits both function request and response payloads to 4.5 MB, so merely increasing the application's 4 MiB parser limit would not solve the incident. [Official limits](https://vercel.com/docs/functions/limitations).

## Validation

- `npm run check`
- `npm run architecture:budgets` (passes with existing oversized-module warnings)
- Targeted Playwright API/browser suite covering transport, central-state revisions, quota recovery, database source and date stability.
- Browser regression: missing local cache + pending manifest still renders saved training, preserves selected date, survives reload and sends no baseline write.
- Browser regression: a plan above 4 MiB hydrates, edits, saves and reloads through compressed transport while preserving every date.
- API regression: large compressed save/read round trip, malformed payload rejection and unchanged stored content.
- Contract regressions: bounded decompression, legacy/plain values, cross-module isolation, frame/marker fidelity, pending-manifest retention, scoped snapshot preservation, conflicts and deletion protection.

## Release and recovery still required

- Direct user authorization is required before the owning Sessions chat runs the official Safe Lane release.
- Production verification must check read-only visibility for known saved dates, current build and sync status; do not edit a real training merely to test saving.
- September 10 needs an identified source (scoped pending snapshot, verified history or backup) and a date-specific recovery with review. Do not call it restored based on this code fix.
- Do not roll back to automatic unscoped historical recovery or clear browser storage.
- Compression is bounded transport protection, not unlimited storage. Future growth should use the existing per-session database foundation through a separately planned migration, not an emergency rewrite.
