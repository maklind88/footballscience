# Team Performance Integration

Owner: Analysis Room. Operating model: distributed-specialist-v4.

## Product Boundary

Team Performance is own-team tagged match statistics. It does not write FS Player clips,
Presentation assets, Squad identities, Scouting imports, or Performance Room GPS data.
The only FS Player shell changes are the existing Analysis Room tab, mount lifecycle,
and an import of the module-owned stylesheet. The shared permission registry gains
one Analysis Room contract; no other module's permissions change.

This is the first native integration, not a claim of feature parity with the source.
It provides Overview, Matches, Players, Zones & corridors, and paginated Events, with
match, venue, half, category, outcome, player and saved-version filters. Player rows
separate ball carrier and receiver involvement; their totals must not be summed as
unique team events. Completion is Completed / all matching tagged events.
Player rankings are capped at 100 involvement rows (labelled in the UI); the player
filter includes all supported source names, including those outside that ranking.

Source-specific weighted scores, game-state filters, per-minute comparisons and
SkunkBox insights are not reproduced yet. Score timelines and playing-time provenance
are retained in the version manifest for a subsequent reviewed metrics contract.
Match dates are not present in this source manifest and are not invented or inferred
from match numbers. Source player names/provider IDs are not silently linked to Squad.

## Source And Approval

Source key: `nc-courage-sop-v1`.

- Dashboard: https://nc-courage-sop-performance.thomasharris4.chatgpt.site/
- JSON: https://nc-courage-sop-performance.thomasharris4.chatgpt.site/api/dashboard-data
- The user explicitly confirmed in this chat on 2026-09-10 (America/New_York) that
  the team may copy and retain the data in Football Science.
- No API stability agreement or upstream upload/publication workflow has been verified.
- The source and API are currently publicly readable. Football Science authentication
  protects our copy, not the original public endpoint.
- Read-only adapter validation observed 17 matches, 1,956 events, 1,138 completed.
  This checks structure and internal counts, not independent football-data accuracy.

The source UI initially renders bundled fallback data and then fetches its API.
Import the JSON endpoint, never the HTML or bundled fallback. The importer's fixed URL
rejects redirects, sends no Football Science credentials upstream, times out after
20 seconds, and caps the decoded response at 32 MiB and 50,000 events / 300 matches.
Overflow fails explicitly; nothing is silently truncated. Larger sources will need a
reviewed paginated/batched provider contract, not a raised browser payload limit.

## Data Contract

`api/_lib/analysis-performance-contract.js` validates match identity, row counts,
unique event IDs, known categories/outcomes/periods, score timeline consistency,
playing intervals and provider hashes. It normalizes only known fields. Unknown
presentation metadata is ignored, but unsupported analytical enums fail closed.
No external HTML or JavaScript is executed. UI labels are escaped.

The content hash covers normalized matches, events, player options, score states and
playing-time metadata. Source `generatedAt`, array ordering and unrelated source UI
settings do not make unchanged statistics appear new. A changed measurement does.
Source timestamps are provenance, not proof of the analyst's last edit.

Tables:

- `analysis_performance_sources`: scoped current-version pointer and revision.
- `analysis_performance_versions`: immutable manifest, content hash, source timestamp,
  importer, import timestamp and event count.
- `analysis_performance_events`: immutable event metadata with indexed dimensions.

All tables have canonical organization/team UUIDs, RLS, revoked PUBLIC/anon/authenticated
access, and minimum service-role grants. Versions/events cannot be updated or deleted
by service_role. No central app-state key or browser-local persistence is introduced.
Older versions remain stored; the UI offers the 20 most recent versions and the API
can read older authorized version IDs. There is no deletion or restore-write endpoint.

The API resolves fresh Platform identity, selects an explicitly authorized team, and
uses roles from memberships, never editable profile claims or fallback team names.
Both read and import RPCs recheck active profile, team and staff membership. Default
access is admin, club-admin, team-admin, coach and analyst. No player/guest access.

## Import Workflow

1. Normal GET reads only Football Science's saved database version. It never fetches
   the analyst site. There is no minute timer, focus refresh or background sync.
2. `POST preview-import` fetches and validates the source without database writes.
   The response contains counts, content hash and the current saved revision.
3. The user selects `Import version`; `POST confirm-import` includes that hash and
   revision. The server refetches and rejects changed source content or a stale revision.
4. A single transaction inserts the manifest and events and advances the pointer.
   The transaction serializes first/concurrent imports and repeats revision checks.
   Failed validation, duplicate IDs, network errors or a stale revision leave the
   previous version unchanged. Retrying identical current content creates no duplicate.
5. Readers see a complete old or complete new version, never a half-written import.

If the confirmation response is lost, reload the saved version and preview again.
Do not assume that aborting a browser request cancelled a committed server transaction.

## Performance

Only Team Performance mount triggers its first saved-data read. Leaving the tab aborts
outstanding client work and clears its transient state. Identity changes clear old data.
Filters are server-side. Detail pages have 50 events; source payloads and full playing
intervals are never embedded in frontend code or delivered with each page.
The database aggregates compact indexed dimensions and fetches detailed JSON for only
the selected page. Player selector values are stored once in each version manifest.

The local PGlite test exercises 50,000 synthetic events, atomicity, historical reads,
membership revocation, RLS/grants and bounded pages. WASM timings are not production
latency or a load/concurrency benchmark. Native Postgres staging measurements remain
mandatory before enabling a large production import.

## Activation And Release

No production changes, migration application or production import are authorized by
the implementation request. The user must explicitly request Deploy/Live in this chat.
This is Safe Lane work.

Before activation:

1. Rebase the isolated candidate on current origin/main and rerun focused regression.
2. Verify/apply the additive migration through the approved Safe Lane path, first in
   isolated staging. Do not seed over existing tables or weaken permissions to connect.
3. Resolve the actual canonical Platform team UUID from server-owned identity. Do not
   use `team-ncc-first`, the displayed team name, or an invented UUID.
4. Configure `ANALYSIS_PERFORMANCE_TEAM_ID` for the intended team and set
   `ANALYSIS_PERFORMANCE_IMPORT_APPROVED=true` only in the intended environment.
   The fixed source can import only into that configured, authorized team. Reads of
   already imported versions remain independent of source availability/import approval.
5. Verify that database backup/PITR or the approved database backup process covers all
   three new tables. Version history in the same database is not a disaster-recovery
   backup and the central app-state storage backup does not cover these tables.
6. Prove authenticated allowed/denied staff reads, preview, import, reload, historical
   version viewing, and unchanged-source retry in staging, then after the authorized
   production release. Confirm that other teams cannot read the imported statistics.

Code rollback can hide the new tab without dropping the imported data. Do not reverse
this migration by deleting versions or events. No separate release of earlier archive
search work is included in this candidate.

## Local Validation

```sh
npm run check
npm run security:platform
npm run qa:supabase
npm run architecture:budgets
node_modules/.bin/playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/analysis-room-performance.api.spec.mjs qa/video-analysis-module-contract.api.spec.mjs
node_modules/.bin/playwright test --config=qa/playwright.config.mjs --project=chromium qa/analysis-room-performance.smoke.spec.mjs
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-analysis-performance-database.mjs
```

PGlite is a local test dependency (verified with 0.5.8), not a browser or production
dependency. The SQL runner fails if unavailable; it does not silently skip SQL checks.
The visual QA page is `/qa/analysis-room-performance-preview.html`; all of its data is
synthetic and labelled as such. It does not write to Supabase or the analyst site.

Verified locally on 2026-09-10: 57 API/module-contract tests, six browser smoke tests
(desktop, tablet, mobile, navigation, import review, escaping and user-scope changes),
syntax checks, platform security, migration checks and architecture budgets passed.
PGlite imported 50,000 synthetic events in approximately 11.7 seconds; one filtered
read took approximately 2 seconds with a 26.8 KB detail-page response. These measurements
are functional test evidence only, not native Postgres or production capacity proof.
No remote migration, production import or deployment was performed.
