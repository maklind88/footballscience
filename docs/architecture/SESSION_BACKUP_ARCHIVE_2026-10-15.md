# Sessions backup archive size recovery

Owner: Session frame integrity task, explicitly assigned the limited backup blocker by the user. Operating model: distributed-specialist-v4. Release remains Safe Lane.

## Production evidence

The failed fresh-backup run 38609960601 returned HTTP 500 before the latest pointer was updated. Read-only production diagnostics on 2026-10-15 found 2,828 receipts and matching effects, no missing effect identities, state revision 24,135, a valid state SHA-256, and approximately 350 MB of uncompressed effect JSON. Bounded 10-row compression diagnostics estimated about 68 MB after base64 encoding, plus a 4.8 MB state envelope. This exceeds the v2 snapshot's 32 MiB aggregate limit. No source data was changed during diagnosis.

## Change

The v3 snapshot keeps the authoritative entry and a small manifest of content-addressed packs in the existing private backup bucket. A pack contains unchanged, individually hashed gzip chunks. Each decoded chunk still has the existing 32 MiB limit and at most 10 receipt/effect pairs. Each stored pack and manifest also stays below 32 MiB; normal packs target 4 MiB. Receipt limits, scope, identities, effects, state hash and revision anchors remain mandatory.

The exporter scans the same read-only RPC through an empty final page. It validates every pair, writes immutable packs, and reads each pack back to verify exact bytes and hash. Only after successful collection does the existing API publish its envelope and latest pointer. Upload, readback, pagination or validation failure leaves the prior pointer untouched. Unreferenced packs from interrupted exports can remain; no automatic deletion or retention change is introduced.

Status and read-only restore drill load and validate each referenced pack in turn, including duplicate identities across packs. Missing, modified or semantically invalid packs fail closed. Storage paths are constructed from the verified organization and SHA-256, not supplied by stored data. Old v1/v2 snapshots remain readable. Source records, receipts, effects, auth and RLS are unchanged; no database migration is required.

The backup function and fresh-export verification allow a bounded five-minute export because the entire existing ledger must be read. This is separate from page-level database timeouts. A continuously edited ledger can still reject a concurrent export; that safety behavior is intentional.

## Validation and recovery

Regression coverage includes an archive whose compressed content exceeds 32 MiB, exact reconstructed content, repeated immutable writes, failed upload/readback/final page, missing/tampered packs, fresh-hash semantic corruption, and invalid scope/count references. The real PostgreSQL/API integration checks pointer preservation and missing-pack status/restore rejection. Production acceptance requires a fresh backup, pointer/hash verification and read-only restore drill after the official Safe Lane release.

For offline recovery, preserve the main envelope and every referenced pack. Verify hashes before decoding; reconstruct receipts/effects from each pack's chunks under the original schema, in one reviewed restore transaction. Never restore source data merely to test a backup. Code rollback to a pre-v3 version cannot validate v3 manifests; previous v1/v2 backup objects remain available, and deployment rollback does not mutate or delete any backup/source record.
