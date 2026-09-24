# IDP Multiple Focus and Independent Exercises

Status: implemented in an isolated candidate, not released. IDP owns this change. Release is blocked by pre-existing staging migration-history drift.

## Ownership and Compatibility

- The existing database-primary `idp_focuses` records remain authoritative.
- One active focus per existing `focus_level`: main, secondary, personal. Category is independent of priority; two focuses may share a category.
- Existing focus IDs, goals, evidence, reviews, exercises and drawings are not migrated or recreated.
- Dashboard priority is main, then secondary, then personal, not most recently edited.
- The selected focus in the player UI is navigation state only. It never rewrites existing links.
- Goals expose an explicit focus selector. Empty selection is stored as no link, not a fallback to main. Existing archived links are preserved on unrelated edits.
- New observations and reviews require explicit valid player-owned focus IDs. Editing an observation preserves its original focus.
- Player exercises belong to the player and may have a nullable focus ID. Linking, changing or removing that link uses the existing versioned intervention API. No Session Planner records or app-state collections are written.
- Exercise metadata is editable outside the drawing modal; the drawing modal remains focused on the pitch.
- Focus update/archive/delete and exercise updates require player scope and row version. A conflict must not silently overwrite a colleague's work.
- Concurrent active focuses at the same level remain blocked by the existing partial unique index. Creating a supporting focus does not demote the existing main focus.

## Migration and Release

Migration `20260924023859_idp_optional_exercise_focus.sql` only drops the NOT NULL requirement on the intervention's existing focus foreign key. Foreign key, row versions, audit, RLS and soft-delete rules remain unchanged. No data rewrite or deletion.

Apply the migration before deploying the nullable-focus API/UI. Safe Lane is required after direct user deployment authorization. Older open clients without focus row versions must reload before editing a focus. Do not reinstate NOT NULL during rollback while unlinked exercises exist.

Local API tests use an isolated mocked PostgREST boundary; browser tests use mocked IDP endpoints and real UI handlers. Migration static safety checks are not a database execution proof. An actual staging migration and authenticated persistence round trip remain required before release.

### Release Attempt: 2026-09-24 UTC

- The user authorized release in the IDP task. No main/staging branch push or application deployment has occurred.
- Local `npm run qa`: 3,207 passed, three existing optional local-media/import tests skipped. Static checks, security, storage, migration safety, performance and architecture guards passed. The staging-only persistence spec passes syntax checking; it is not part of local QA and still requires execution.
- Migration `20260924023859` is applied to staging project `pokrksgempkuraueglpu`. Verified: `focus_id` nullable, RLS enabled, focus foreign key retained. No player rows were rewritten.
- The migration tool initially recorded `20260924031040`. Supabase CLI `migration repair` registered the canonical file version and removed only that duplicate history entry. The canonical entry was verified afterwards.
- A subsequent linked `db push --dry-run` failed on five pre-existing remote versions: `20260721153900` (app-state source), `20260721153942` (app-state writes), `20260825024501` (Medical projection), `20260827051639` (Leaderboard), `20260831120416` (Squad projection). These have differently versioned files in the repository and were not repaired by IDP.
- Production database and live application remain unchanged. Do not use `include-all` or blanket migration repair to bypass this failure.
- `qa/idp-persistence.live.spec.mjs` adds the authenticated save/read/link/unlink/stale-version proof to staging smoke. It checks the exact staging origin and Supabase project, uses a random QA-only player ID, and soft-deletes its exercises/goals/focuses. It does not run writes in production. It has not yet run against staging. Its QA-only profile and audit records remain identifiable by the logged fixture ID for scoped staging cleanup.
- Resume through Safe Lane after the historical versions have been reconciled by their owners. The production migration must precede application promotion; authenticated staging persistence and production postdeploy remain mandatory.

## Regression Coverage

- Multiple focuses: explicit selection, independent category and priority, original main untouched.
- Goal creation against a selected supporting focus; no automatic relinking of unlinked goals.
- Draw, save without a focus, see the saved bank entry, reopen, rename, link and unlink without changing the drawing.
- Wrong-player focus and stale-version rejection; unchanged archived links survive edits.
- A successful save followed by failed refresh retains its server ID, avoiding a duplicate create on retry.
- Desktop/mobile browser interaction with the same tactical styles as the app shell.
