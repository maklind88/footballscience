# Analysis Room Archive Reads

Candidate scope, 2026-09-07. This is not evidence of deployment or a remote database migration.

## Ownership

- Analysis Room owns Overview, calendar/search UX and the read integration described here.
- FS Player remains the owner of video metadata writes, tagging, media storage and clip presentations. Its existing `matches` API action remains unchanged for other consumers.
- Schedule remains the owner of activities and their synchronization. Overview reads `getScheduleState` / `getScheduleStateForVideoAnalysis`; it does not promote a second schedule database to source of truth.
- The separate platform Presentation Mode and imported Team Performance statistics are outside this change.

## Read Contract

The existing authenticated, permission-guarded `/api/video-analysis` adds two GET actions:

| Action | Inputs | Result |
| --- | --- | --- |
| `library-search` | search, date, type, cursor, limit | matched sessions, hasMore, nextCursor, checkedAt |
| `library-calendar` | month, search, date, type | per-day counts, at most two session previews per day, linked schedule IDs, checkedAt |

`videoRepository` owns HTTP access. Components do not fetch data or access Supabase.

- The database filters before pagination. Search is not limited to the previously loaded 160 matches.
- Search text is a literal case-insensitive substring of title, opponent, competition and venue, limited to 120 characters. Full ISO dates, day/month/year dates and ISO months are converted to date ranges. Type is all, match or training.
- Pages use descending `(coalesce(match_date, 0001-01-01), id)` keyset cursors, including undated sessions. UI pages contain eight records; API limit is 1-50. There is intentionally no estimated archive-wide total.
- Calendar reads cover only the requested month (at most 31 days). Counts cover all matching saved sessions, even when only two are previewed. Click the date/overflow button to reach paged results.
- Matching local Schedule suggestions are shown separately from video archive results. Their completeness/freshness depends on the Schedule public state contract, not on this new video query. They retain existing date/weekday search terms.
- Video/source metadata is hydrated only for returned records. Active clip counts are aggregated in SQL, not obtained by downloading a capped list of clips.
- Video bytes, thumbnails, local handles and media contents are neither uploaded nor downloaded by these reads.

## Freshness And Failures

`archiveReadsController` owns the request lifecycle and is disposed with the module runtime.

- Search input debounce: 250 ms. Old requests are aborted, and generation checks reject late responses even if a transport ignores abort.
- The visible online Overview refreshes after 60 seconds. Hidden browser tabs, hidden room surfaces and FS Player do not poll. Focus/online/visibility changes resume stale reads; returning from FS Player re-reads metadata.
- Failures back off to 120, 240 and at most 300 seconds. Refresh/Retry remains explicit. Existing successful data is retained with an error, not relabeled as fresh.
- Polling defers while a day-link input has focus, preserving in-progress editing.
- Team/user scope changes clear archive/calendar and Schedule candidate caches before reading the new scope. No archive results are persisted in browser storage.
- This is bounded polling, not real-time push. It cannot import analyst GitHub changes, fix stale upstream statistics, or force another module to synchronize.

## Database And Security

Migration: `supabase/migrations/20260908014213_analysis_room_video_archive_reads.sql`.

- Additive indexes on active session cursors, trigram title/opponent/competition/venue search, and active clip counts.
- Read-only `public.video_library_archive` and `app_private.video_library_match_json` functions; security invoker, empty search path, fully qualified objects.
- Execute is revoked from PUBLIC, anon and authenticated; only service_role may call these functions. No browser table grants or RLS policies are relaxed.
- Organization/team scope comes exclusively from the authenticated server actor. Missing team scope fails closed; query-supplied scope and legacy demo-tenant defaults are not used.
- Existing route permission matrix still applies. This change does not grant players access or alter roles.
- Ordinary indexes can hold write locks while being created. Inspect production table sizes and the migration plan during the later Safe Lane release; local timings are not a production migration estimate.

## Validation

Scoped tests:

- `qa/analysis-room-archive.api.spec.mjs`: input/cursor validation, actor scope, failures, late responses, visibility/offline/navigation, cache scope changes.
- `qa/analysis-room-archive.smoke.spec.mjs`: historical archive result, eight-row navigation, exact clip counts, refresh/pause/debounce and responsive layouts.
- `qa/analysis-room-overview.*.spec.mjs`: distinct same-day activities, no off/meeting leakage, calendar consistency, date navigation, day linking and pagination.
- Existing video-analysis module/API contracts and selected playback/day-link smoke tests protect FS Player integration.

Actual SQL runs locally in PGlite against the real foundation migration plus this migration, with 50,000 sessions and 50,000 clips. This is separate from browser fixtures. It tests exact counts, keyset continuation, tenant separation, browser-role denial, month previews, escaped search and cursor-index usage.

Install PGlite into a temporary QA directory outside the repository, then run:

```sh
node qa/analysis-room-archive.sql.mjs /absolute/path/to/node_modules/@electric-sql/pglite
```

Observed local SQL reads across repeated runs: approximately 1-75 ms, month response approximately 30 KB for 31 days and 62 previews. These are fixture observations, not production SLAs. Production query plans, permission behavior and real dataset payload sizes still require Safe Lane verification.

## Release And Remaining Work

No remote migration, staging, main integration or deploy is authorized by this implementation task. The isolated candidate includes the prior Overview correctness commit.

After a future explicit user Deploy/Live command, validate latest main, run Safe Lane, apply the additive migration through the official workflow before serving the new client, and verify authenticated reads with a real team. Missing migration returns a visible retryable 503; it must not silently claim a truncated archive is complete.

Still separate: Schedule server-history/freshness guarantees; upstream Team Performance import freshness; match-review-to-coaching-action design. Do not claim this archive polling updates those other sources.

Design references: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [function execution privileges](https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A), [PostgreSQL expression indexes](https://www.postgresql.org/docs/current/indexes-expressional.html).
