# Analysis Room Archive Search

## Candidate Scope

Owner: Analysis Room, Overview archive search only.
Branch: `codex/analysis-room-archive-search-20260909`.
Base: `origin/main` at `0d392d53`.

The user approved archive search and explicitly deferred automatic refresh.
This candidate starts from current main, not the older combined candidate
`codex/analysis-room-archive-refresh-20260907` (`0f46f4cf`).
Do not ship that older combined branch as part of this work.

- Search the complete active team video-session archive, not just the latest
  160 sessions already loaded by Overview.
- Keep the existing search field, calendar, session controls, local-video restore,
  FS Player, clip tagging, Presentation and Schedule write contracts.
- Show eight remote video results per page, separately from local Schedule
  suggestions. Both result groups have bounded page controls.
- Search title, opponent, competition or venue; filter match/training and date.
  ISO dates, day/month/year and ISO months in the search field become date ranges.
- No interval, recurring timeout, focus/online/visibility refresh or calendar RPC.
  The only search timer is a single 250 ms typing debounce.
- Explicit Refresh, returning to Overview or completing an existing local
  metadata edit reloads the active search through the existing library flow.
- Clearing the query hides results and aborts pending work; leaving Overview
  aborts search work. Late responses and previous-team results are discarded.

This is video-session archive search, not a new 50,000-clip Data Explorer.
The existing calendar still uses its existing loaded window; this candidate
does not claim to make old calendar months complete.

## Data Contract

`GET /api/video-analysis?action=library-search` accepts `search` (max 120 chars),
`date`, `type` (`all|match|training`), opaque `cursor` and `limit`
(default 8, max 50).

The existing Video Analysis permission guard remains authoritative. Default
coach/analyst reads are allowed; default player access is denied. Organization
and team come only from the authenticated actor. No demo-tenant fallback.

The server calls `public.video_library_search` with trusted actor scope.
Filters run before a keyset page ordered by date descending, then ID descending.
Only the returned page is hydrated with video/source metadata and exact active
clip counts. Missing dates sort last. Search wildcards are treated literally.
There is no total-archive count or load-all request.

Returned fields: `matches`, `hasMore`, `nextCursor`, `checkedAt`, `schema`.
Failures return an explicit retryable error, never a partial local result
presented as the complete archive. A page traversal is not a snapshot: an
explicit Refresh returns to page one when other users have changed records.

Migration `20260910012100_analysis_room_archive_search.sql` adds read functions
and active-row indexes only. Functions use security invoker, an empty search
path and explicit service-role execution grants; anon/authenticated/public
execution is revoked. Existing RLS and source records are not changed.
No video bytes, new uploads, thumbnail caches or local paths are written.

## Validation

Local proof:

- `qa/analysis-room-archive-search.api.spec.mjs`: filters, cursor validation,
  actor scope, permission guard, error handling, stale response cancellation,
  clearing search, leaving Overview and team-cache isolation.
- `qa/analysis-room-archive-search.smoke.spec.mjs`: historic records beyond
  the initial 160, bounded pages, explicit refresh with no automatic polling,
  debounce, retry, date/type filters, FS Player navigation, desktop/tablet/mobile.
- Existing Video Analysis API/module contracts and targeted playback/day-link
  regression tests.
- `qa/analysis-room-archive-search.sql.mjs`: disposable PostgreSQL/PGlite,
  actual foundation plus candidate migration, 50,000 sessions and 50,000 clips,
  literal search, keyset ordering, exact counts, preferred source, index use
  and tenant/role isolation.

SQL proof requires a separately installed local `@electric-sql/pglite` package:

```sh
node qa/analysis-room-archive-search.sql.mjs /path/to/node_modules/@electric-sql/pglite
```

The local SQL timing is not a production latency guarantee.

## Release Boundary

Not deployed. No staging, remote migration, main integration or production
verification is part of this instruction.

A later explicit user Deploy/Live command is required. This is Safe Lane:
recheck the latest main and candidate scope, inspect production table/index
sizes and query plans, apply the additive migration through the approved
workflow, then release the compatible API/UI and verify authenticated search
and existing video restore on production. Index creation takes a write lock;
evaluate an appropriate maintenance window for actual table size before apply.
Check Supabase advisors after the migration.

Application rollback can leave the unused additive read functions/indexes in
place. No destructive rollback or source-data migration is required.

Reviewed guidance:
[Supabase functions](https://supabase.com/docs/guides/database/functions) and
[Supabase changelog](https://supabase.com/changelog).
