# Medical / Sessions acceptance prerequisites

Owner: System / Security, shared save reliability. Medical Room owns clinical
rules and test-player suitability. Sessions owns its editing/review workflow.
This branch adds QA only; it must not be bundled into the active #252 release.

The optional `verify_save_readiness` input on Staging Smoke runs a read-only
probe against exactly `https://staging.footballscience.xyz` and the canonical
staging Supabase project. `expected_save_build_id` must be the exact deployed buildId
(Git SHA or Vercel deployment id). Backend and build are checked before login and again after reads.

The probe creates two temporary login sessions using existing staging secrets;
if `STAGING_QA_PEER_USERNAME` and `STAGING_QA_PEER_PASSWORD` exist, the second
session uses them. Otherwise it reports same-account coverage explicitly.
Accounts are verified through Auth. Only `app_metadata.role` is used for the
local policy expectation; this is not proof of server write authorization.
Both sessions are revoked with `scope=local` after the probe. No account, role,
stored module data, permissions, schema, or deployment is changed.

Only the two module keys are read. Stored values, tokens, user ids and content
hashes are never logged. Equal revisions for the same identity must return
equal content; changed revisions are reported without claiming consistency.
Metadata sourceOfTruth is a contract declaration, not proof of physical DB mode.

## Remaining acceptance matrix

Requires two distinct permitted users, a designated synthetic Medical player,
and an empty test date owned by the run in isolated staging. Before any writes,
verify the exact backend, deployed SHA, scope, permissions and fixture ownership.
Never restore a whole module snapshot over concurrent work.

1. User A saves; user B sees the accepted revision after ordinary navigation.
2. Different fields preserve both users' edits. Same-field conflicts preserve
   both drafts or show an explicit review; never silently discard either.
3. Offline edits remain recoverable through reload and reconnect.
4. A server-accepted save with a lost response does not duplicate or revert work.
5. Medical future dates do not outrank actual edits; archived records stay archived.
6. Sessions local review displays both versions and resolves only by user choice.
7. Account/team changes do not replay another scope's pending writes.
8. Cleanup only run-owned records, guarded by current revision/operation identity;
   verify unaffected content remains. Never repair existing user incidents blindly.

The probe alone does not pass this matrix. Existing local synthetic browser and
native PostgreSQL tests are complementary evidence, not real two-account proof.
