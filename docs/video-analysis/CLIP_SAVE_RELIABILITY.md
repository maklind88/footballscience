# Original Clip Save Reliability

Owner: FS Player / Video Analysis. Local candidate, 2026-11-11. Not deployed.

## Problem And Scope

The original `save-clip` update path patched the clip row, hard-deleted its relations, then inserted replacements in separate HTTP requests. Archive-only database triggers correctly rejected the deletes after timing/revision could already have changed. Retrying the unchanged draft could then produce a revision conflict.

This repair applies only to editing existing original clips. New live-tag creation keeps its existing path. Independent popup playlist versions continue to use `video_analysis_save_timeline`; they do not mutate original clips. There is no new UI, permission model, source-media upload or cross-module write ownership.

## Repair

- Add nullable `archived_at` columns to clip players, tags, labels, descriptors and notes. No existing records are deleted or rewritten by the migration.
- Route existing-clip saves through the service-role-only `video_analysis_update_clip` RPC. Browser roles have no execute permission; the function is security-invoker with an empty search path.
- Lock the scoped, active clip and check the expected revision inside the transaction. Recheck private ownership, match/video scope and coding references. The original source and creator cannot be moved or replaced.
- Update the clip and archive superseded relations in the same transaction. Existing unique relations can be reactivated. A full before/after snapshot is recorded in `video_clip_revisions` before commit. All hard-delete guards remain.
- Return saved active relations from that same transaction. FS Player relation readers and the analysis facts view ignore archived relations.
- Fail closed when the RPC is missing. There is no fallback to the previous partial-update path. Optional collaboration logging and existing best-effort IDP synchronization do not turn a committed save into a false failure.

## IDP Compatibility

`api/_lib/idp-clip-bank-metadata.js` is the only inspected non-FS-Player reader of the affected relation tables. Its `selectMiniGameLabelsByClipIds` query now filters `archived_at=is.null`, preventing removed MG principles from reappearing in IDP's clip bank after a later read. The shared query covers both the player clip itself and related moment clips.

The user explicitly approved this narrowly scoped compatibility change on 2026-11-11. FS Player owns the combined task; IDP is the affected consumer. The production-code change in IDP is one additional query filter. IDP writes, business rules, permissions and tenant filters remain unchanged. The ownership/compatibility blocker is resolved locally; Safe Lane release validation remains required.

## Verification

`qa/video-analysis-clip-persistence.test.mjs` replaces the former defect-confirming diagnostic with positive API-to-PostgreSQL regression tests using only synthetic data:

- Complete save, active relation reload and durable revision snapshots.
- Forced failure after clip and relation updates rolls everything back; the exact same draft can retry successfully.
- Concurrent requests use separate PostgreSQL sessions; one wins and the other receives a conflict without overwriting data.
- Removing and re-adding relations preserves history without duplicate active rows or stale analysis facts.
- Cross-team access, foreign coding references, malformed relation scope and private non-owner edits are rejected without partial changes.
- Missing-RPC failure, optional logging/IDP outage behavior, ownership preservation, archive/Undo and migration replay.
- New live-tag creation still succeeds on its existing path without calling the new update RPC.
- IDP enrichment reads active labels after actual clip edits, including related moments, without restoring archived labels or modifying source records. `qa/idp-api.api.spec.mjs` also covers reactivation, no active labels, unchanged organization/team scoping and GET-only requests.

Run the native tests with locally installed PostgreSQL 17 binaries:

```sh
FS_TEST_PG_BIN=/absolute/path/to/postgresql17/bin node --test --test-concurrency=1 qa/video-analysis-clip-persistence.test.mjs qa/video-analysis-playlist-persistence.test.mjs
```

The helper starts a disposable database on a private Unix socket, with no TCP listener or inherited database connection. It always stops and removes that database after testing. No production database is used.

Local results on `codex/fs-player-clip-save-20261111`: initially based on playlist candidate `fdb55c9215263a972aa82392c37d66b8e5c21e06` and main `92fdbf47a8347e8633267fa7b96ec40fb33c6e07`, then rebased without conflicts onto `origin/main` `62116896cfa43b8f6c3b08beaf37ea5a8d8b46c1`. The intervening three commits concern storage, not clip persistence. The playlist parent is now `c550880d6`.

- Native PostgreSQL 17: 19 tests passed across original clips, IDP enrichment and independent playlists, including the parent test cases.
- Combined API/module contracts: 557 passed (476 FS Player and 81 IDP), rerun with the approved IDP filter.
- Chromium: 94 passed across playlist selection, clip popup/review/principles/preview, playback, tag feedback and row ordering. Desktop/mobile screenshots and actual-video pixel checks passed before the one-line IDP backend filter; no UI files changed in the compatibility follow-up.
- `npm run check`, `npm run qa:supabase` (72 migrations), `npm run architecture:budgets` and `git diff --check`: passed. Existing architecture size warnings remain; no new module file exceeds 500 lines.
- Production PostgREST/schema compatibility and authenticated staging/live behavior remain unverified. No migration was applied remotely, no branch was pushed and no deployment was started.

## Release Order And Recovery

Release requires a new direct user command and the Safe Lane, because this changes API persistence and schema. Before release:

1. Keep the approved, locally verified IDP read filter in the same release as the new clip persistence path.
2. Revalidate the isolated candidate against current `origin/main` and the deployed schema. Keep unrelated root-worktree changes out.
3. Apply the additive migration before deploying the API/read filters. Verify service-role execution and denied browser execution through the project's database release process.
4. Run required Safe Lane staging checks for original save/reload, conflict/failure retention, live tagging, IDP reads and independent playlists. Then use the official production release path and postdeploy verification.

Migration-only rollout does not archive existing rows and remains compatible with the previous application. Once the new RPC has archived relations, rolling back to old readers that lack archive filters would expose superseded data. Use a forward-compatible fix or retain the new reader filters during rollback. Do not remove archive protections or hard-delete relation history.

Previously partially changed production clips are not automatically rewritten: their intended values cannot be inferred safely. After rollout, a fresh reload obtains the current revision before an explicit edit is saved. A lost HTTP response after a successful commit still requires reload/reconciliation rather than blind retry.
