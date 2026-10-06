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

## Isolated mutable acceptance (separate optional workflow input)

`verify_save_acceptance=true` enables a separate Playwright configuration with
one worker, no retries, no screenshots/video/traces, and explicit fixture opt-in.
It shares the official production-edge concurrency group without cancellation,
so it must not overlap an official staging/production/rollback edge job.

System / Security owns this QA harness. Medical and Sessions remain the owners
of their domain behavior; this candidate changes no product module or API.
The harness verifies the canonical staging backend and exact reviewed build,
uses the existing staging admin to create one random temporary team-admin,
verifies both accounts through Auth, and never uses a production credential.
Before writes, today's staging session must be absent. Medical mutations must
leave every non-run-owned entry and top-level field unchanged. Session commands
may affect only the run-owned date and blocks. Browser app-state writes to any
other module are blocked in the test context.

Coverage: two authenticated Medical writers, future activity versus edit time,
stale archive protection; two real Sessions browser contexts, offline draft
plus independent online edit, reconnect, reload visibility, same-field conflict
and explicit Keep central review resolution. This does not certify Medical UI
visibility for a real player, physical devices, or cold offline application boot.

Cleanup closes browser writers first, archives only run-owned Medical fixtures,
tombstones only run-owned Session blocks, revokes the temporary peer session,
pauses/deletes only that created account, and logs out only the created primary
session. Audit records, archived synthetic Medical rows and an empty run-labelled
session date remain intentionally. Whole-module restoration is never used.
A changed deployment or ownership stops fixture writes and reports the failure.

Readiness run 37454064385 passed on staging deployment
`dpl_7kYorqofNykQ4Uu4ArS1sRNts6Wq`: existing staging account is admin; Medical
same-account reads had equal revision/content; Sessions was confirmed absent.
No second staging secret existed. Six standard staging browser probes passed,
two environment-specific probes skipped. The earlier run 37453148976 failed
because the first probe expected a SHA while staging reports a deployment id;
the exact build guard now accepts either documented identifier format.
