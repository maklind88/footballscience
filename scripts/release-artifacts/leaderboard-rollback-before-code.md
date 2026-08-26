# Leaderboard database-first rollback artifact

Status: dormant. The adjacent SQL file is evidence and an emergency source artifact, not an active Supabase migration. It must remain outside `supabase/migrations` unless the rollback is separately approved and actually used.

## Frozen identity

- Forward migration: `20260825181453_leaderboard_foundation.sql`
- Forward SHA-256: `c4e719b1fc7600f57f4bcf8726704877a76b793423eaeb42d4c7365e43d19717`
- Rollback artifact: `scripts/release-artifacts/leaderboard-rollback-before-code.sql`
- Raw bytes: `17449`
- Raw/canonical SHA-256: `233a04c2190890ade48fa3abab53e36aa8f5f112871845cc14653ac432d7d986`
- Canonical Supabase CLI v2.115.0 form: `1` statement, `17449` bytes, MD5 `0844a24b99ec69f07dff6352707e54d2`

## Use boundary

This artifact is allowed only before Leaderboard application code is deployed and while all five Leaderboard tables are still empty. It is forbidden after any Leaderboard data or user traffic exists. It never authorizes migration-history repair, database reset, PITR, `CASCADE`, broad `REVOKE`, or an automatic retry.

## Promotion procedure if rollback is separately approved

1. Obtain a new explicit rollback GO after fresh release-traffic, backup, production-history, catalog, row-count, Session Planner, Set Pieces, auto-apply-off, and preview-parent parity gates.
2. Use the retained verified production preview, or create a fresh production-parent preview if parity cannot be proven. Do not apply the artifact directly to production.
3. Call Supabase `apply_migration` once on that preview with the exact adjacent SQL bytes and the name `leaderboard_rollback_before_code`. Let Supabase assign the new server version `V_R`; never reuse this dormant filename as the migration version.
4. Read `V_R` back from preview migration history. Require it to be the sole new edge, then verify preview history, exact pre-Leaderboard fingerprints, zero Leaderboard catalog/data/permissions, unchanged Session Planner and Set Pieces state, advisors, and logs.
5. On an isolated emergency Git branch from trusted `main`, copy the artifact byte-for-byte to `supabase/migrations/<V_R>_leaderboard_rollback_before_code.sql`. Require the copied file to retain SHA-256 `233a04c2190890ade48fa3abab53e36aa8f5f112871845cc14653ac432d7d986`, pass migration safety/contracts, and contain no other pending migration. Land that exact history file through the protected rail before production merge; auto-apply must remain off.
6. After a second explicit production rollback GO, call `merge_branch` exactly once for the verified preview. A timeout or ambiguous response is state-audited and never blindly retried.
7. Postverify production history includes the foundation version followed by `V_R`; Leaderboard objects/data/permissions are absent; all pre-Leaderboard dependency/ACL fingerprints and out-of-scope gates are exact; advisors/logs are clean. Keep application code undeployed.

If any precondition fails, leave this artifact dormant and use a separately reviewed incident-recovery plan.
