# IDP Player Development System

Date: 2026-06-14
Status: planning complete, production code not started
Owner area: IDP / Player Development

## Executive Decision

IDP is the external product name. Architecturally this must be the Player
Development System: a daily coaching workspace that answers what each player is
working on, why it matters, what evidence exists, and what the next action is.

This is not a form module, a document editor, a PDF generator, or an admin
surface. The MVP should be small, fast, and coach-first.

The module must be built as a separate product area under `src/modules/idp/`.
It must reference Squad and Video Analysis records instead of duplicating
players or clips. UI components must not call Supabase directly; data access
runs through services, repositories, and guarded APIs.

## Current Project Context

- Product language now treats the old Player Profiles workspace as Squad.
- Current squad/player identity still uses `football-player-profiles-v1` while
  the long-term path moves toward `squad_*` tables.
- Video Analysis is already a database-primary metadata module with
  `video_clip_instances` and `video_clip_players`.
- Existing lightweight IDP fields inside Squad should be treated as legacy
  compatibility data, not the future IDP source of truth.
- IDP should not be implemented inside `app.js`, `app-runtime.js`, Squad,
  Medical, Scouting, or Video Analysis.
- Because IDP touches staff accountability, player development records, and
  cross-module evidence, implementation belongs in the Safe Lane.

## 1. Product Requirements Document

### Product Goal

Coaches can open IDP daily and immediately understand each player's development
state: current focus, category, linked football principle, evidence, clip-bank
status, review rhythm, owner, next action, and timeline.

### Primary Persona

Coach now. Future player access must be supported by architecture, but no player
login or player-facing portal belongs in MVP.

### MVP Scope

Squad IDP dashboard, player development card, current focus creation/editing,
category/principle links, automatic clip bank from Video Analysis player tags,
clip review, curated evidence marking, short coach notes, review dates, next
action, timeline, and basic milestones.

### Explicitly Excluded From MVP

Player login, AI-generated plans or summaries, PDF exports, long review forms,
complex ratings, gamification, leaderboards, advanced analytics, full Medical or
Performance integration, and complex meeting scheduling.

### Product Success Metric

A coach knows exactly what a player is working on without asking anyone.

## 2. User Flows

### Flow A: Daily Squad Review

Coach opens the dashboard, scans current focus, owner, evidence status, clip
count, review pressure, and next action, then filters by Review Due, Needs
Evidence, or New Clips.

### Flow B: Create Current Focus

Coach opens a player, selects category, writes a short title, optionally links
phase/principle context, and saves. System assigns owner/review defaults,
suggests next action, and records a timeline event.

### Flow C: Clip Bank To Evidence

Video Analysis tags a player, IDP upserts a clip-bank item, and the coach later
chooses Keep in Bank, Link to Focus, Mark as Evidence, Archive, or Hide. Only
curated clips become evidence.

### Flow D: Lightweight Review

Coach opens a Ready For Review or Review Due focus, sees evidence first, records
progress, short note, status change, and next action. System creates review and
timeline records.

### Flow E: Staff Accountability

Head coach filters by owner or overdue state. Ownership panel shows player
owner, focus owner, evidence creator, and review creator while warnings surface
missing owner, no focus, stale evidence, or overdue reviews.

## 3. UX Wireframes

### Squad IDP Dashboard

```text
+--------------------------------------------------------------------------+
| IDP                                  [Status] [Owner] [Category] [Search] |
+--------------------------------------------------------------------------+
| Player        Focus                Owner   Evidence  Clips  Review  Next |
| A. Player     Box defending        MK      Good      2 new  Jun 18  Review clips |
| B. Player     Third-man support    RH      Sparse    0      Due     Add evidence |
| C. Player     Leadership voice     JS      Ready     1      Jun 22  Complete review |
+--------------------------------------------------------------------------+
```

Design rules:

- Rows should be dense, calm, and scannable.
- No large empty cards.
- Dashboard should behave like a coaching command board, not a data table dump.

### Player Development View

```text
+------------------------------------------------------------------------+
| Player header: name, position, role, owner, last review, next review     |
+------------------------------------------------------------------------+
| Current Focus                         | Next Action                      |
| Title, category, principle, status    | Suggested action + owner/date    |
+------------------------------------------------------------------------+
| Clip Bank                             | Evidence                         |
| New/reviewed clips with filters       | Curated proof linked to focus    |
+------------------------------------------------------------------------+
| Development Timeline                  | Staff Ownership                  |
| Milestones and reviews                | Owners/contributors/accountable  |
+------------------------------------------------------------------------+
```

First screen must answer: what is this player working on, what evidence exists,
and what needs to happen next?

## 4. Information Architecture

Primary navigation target: `IDP`.

Primary views: Dashboard, Player Development View, Focus Detail, Clip Bank,
Evidence, Reviews, and Timeline.

Primary object hierarchy:

```text
Player
-> Development Profile
-> Development Area
-> Current Focus
-> Clip Bank Item
-> Evidence
-> Review
-> Next Action
-> Milestone
-> Development Timeline
```

## 5. System Architecture

### Module Boundary

Target module: `src/modules/idp/` with `index.mjs`, routes, state, store,
renderer, actions, adapter, CSS, components, services, repositories, domain, and
constants.

The user-provided structure with many component/service files is directionally
right, but implementation should start smaller. Add files only when each
responsibility becomes real. Keep components under 300 lines and new module
files under the project size targets.

### Runtime Flow

```text
UI component
-> module actions
-> service
-> repository
-> guarded API
-> Supabase
```

No UI component should write directly to Supabase. Video Analysis should emit or
expose tag events; IDP owns the automation that creates clip-bank items.

### API Boundary

Future server routes: `GET /api/idp/dashboard`, `GET /api/idp/players/:playerId`,
`POST /api/idp/focus`, `PATCH /api/idp/focus/:focusId`,
`POST /api/idp/clip-bank/review`, `POST /api/idp/evidence`,
`POST /api/idp/reviews`, and `POST /api/idp/automation/video-player-tagged`.

All routes must be registered in the Permission Matrix before production use.

## 6. Database Schema

This is a schema design, not a migration. Migration work should be created only
after contract tests and API boundary decisions are ready.

### Shared Columns

Every tenant-owned IDP table should include `id`, organization/team scope,
optional club/season scope, `created_by`, `updated_by`, `deleted_by`,
`deleted_at`, `row_version`, `created_at`, `updated_at`, and bounded `metadata`.
Use soft delete, indexed foreign keys, explicit check constraints, and partial
indexes for active rows.

### Proposed Tables

| Table | Responsibility |
| --- | --- |
| `idp_profiles` | References `squad_players` and optional roster membership; owns status, owners, strengths, leadership profile, learning notes, last review, and next review. |
| `idp_development_areas` | Category-specific areas: Technical, Tactical, Physical, Psychological, Leadership. |
| `idp_focuses` | Current and historical focus records with category, focus level, phase/sub-phase, principles, owner, status, evidence status, review date, and completion. |
| `idp_clip_bank_items` | References player and `video_clip_instances`; owns IDP status only: New, Reviewed, Linked To Focus, Marked As Evidence, Archived, Hidden. |
| `idp_evidence` | Curated proof linked to player/focus with structured source module/table/id and short bounded notes. |
| `idp_reviews` | Lightweight progress review with evidence summary, coach note, optional player response, next action, and status change. |
| `idp_next_actions` | Dashboard/player next steps such as Add Evidence, Review Clip Bank, Complete Review, or Create Next Focus. |
| `idp_milestones` | Timeline events with controlled type, source reference, event date, and creator. |
| `idp_staff_ownership` | Ownership records for player, focus, review, or evidence responsibility. |
| `idp_audit_events` | Action summaries, changed fields, actor, scope, and timestamps; no full sensitive note payloads. |

### Index Direction

- Dashboard: `(team_id, status, next_review_on, updated_at desc)` partial where
  `deleted_at is null`.
- Player view: `(team_id, player_id, updated_at desc)` partial where active.
- Focus lookup: `(profile_id, status, review_date)` partial where active.
- Clip bank: `(team_id, player_id, status, created_at desc)`.
- Evidence: `(focus_id, created_at desc)` and `(team_id, player_id,
  created_at desc)`.
- Automation idempotency: unique active index on `(player_id, clip_instance_id)`
  for `idp_clip_bank_items` where not deleted.

## 7. State Architecture

Client state should be a thin view model, not the source of truth.

- `idp-state.mjs`: local UI filters, selected player id, active panel, loading
  state, optimistic command status.
- `idp-store.mjs`: normalized cache of profiles, focuses, clip bank items,
  evidence, reviews, next actions, and milestones returned by the API.
- `idp-adapter.mjs`: read boundary for legacy Squad IDP fields during migration.
- Server/database remains authoritative for IDP records.
- Browser localStorage may cache view preferences only; it must not become hidden
  IDP production data.

## 8. Module Dependency Map

```text
IDP reads:
  Squad -> player identity, roster membership, position, role
  Video Analysis -> clip instances and tagged players
  Identity / Platform -> staff users, roles, tenant scope
  Principles / Game Model -> phase, sub-phase, team principle, mini-game principle

IDP may reference later:
  Session Planner -> training context
  Performance -> staff-safe performance notes
  Medical -> coach-safe availability context only
  Calendar -> review meetings/reminders

IDP owns:
  development profiles
  development areas
  focuses
  clip-bank review status
  curated evidence links
  reviews
  next actions
  milestones
  ownership/accountability records
```

Forbidden dependency direction:

- Video Analysis must not import IDP UI.
- Squad must not own focus/evidence/review logic.
- Medical must not receive private IDP notes unless explicitly permissioned.

## 9. Automation Map

| Trigger | Action | Guardrail |
| --- | --- | --- |
| Player tagged in video | Upsert clip-bank item | Idempotent by player and clip |
| Clip linked to focus | Update focus evidence status | Do not auto-create evidence |
| Clip marked as evidence | Create evidence record and milestone if first evidence | Evidence must be curated |
| Focus has enough evidence | Suggest Ready For Review | Suggest, do not force |
| Review date overdue | Create or refresh next action | One active action per focus/type |
| Review completed | Create review milestone | Append-only timeline |
| Focus completed | Create focus completed milestone | Preserve old focus |
| Player has no active focus | Dashboard warning | No fake default focus |
| Player has no recent evidence | Dashboard warning | Configurable threshold |

## 10. Security Review

Security posture:

- RLS enabled on every IDP table.
- Explicit grants only; new Supabase projects no longer expose public tables to
  the Data API by default, so migrations must bundle grants with RLS policy.
- UI talks to guarded API routes, not directly to Supabase.
- Authorization uses server-owned app metadata and platform memberships, never
  user-editable metadata.
- Staff roles can read development records according to team scope.
- Coaches/admins can edit IDP; player access is future read-limited and must not
  see staff-only notes by default.
- Medical/private fields stay in Medical; IDP can reference coach-safe context
  only.
- Audit summaries must avoid storing raw sensitive text where not needed.
- Direct hard delete should be blocked for IDP records.
- Stale writes must use `row_version` or server merge rules.

Relevant Supabase checks reviewed on 2026-06-14:

- Row Level Security guidance:
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Securing Data API/grants guidance:
  https://supabase.com/docs/guides/api/securing-your-api
- 2026 breaking change: new tables are not automatically exposed to Data API:
  https://supabase.com/changelog?tags=breaking-change

## 11. Scalability Review

Dashboard queries must be paginated and filterable by team, owner, status,
category, review date, and clip-bank state. Do not fetch all historical evidence
or clips for the whole organization.

Player views should load above-the-fold summary first, then paginate clip bank,
evidence, reviews, and timeline. Clip bank filters should query indexed Video
metadata rather than copying phase, outcome, or principle fields into IDP except
for optional denormalized display snapshots created by the server.

Automation must be idempotent. Video tagging may fire repeatedly, so clip-bank
upsert rules need unique constraints and audit-friendly no-op behavior.

## 12. Risk Assessment

### Must Fix Now

- Define IDP as its own module and data owner before code.
- Prevent player and clip duplication.
- Decide API/server-owned write path before any UI writes.
- Keep existing Squad and Video Analysis work untouched.

### Should Fix Soon

- Add module contract entry for IDP.
- Add permission matrix entries and API route guard plan.
- Draft database migration with RLS, grants, indexes, row versions, and no hard
  deletes.
- Add contract tests for schema, API payloads, module boundary, and no direct
  Supabase calls from components.

### Can Wait

- Player access.
- AI assistance.
- PDF/report exports.
- Calendar reminders.
- Performance/Medical deep integration.
- Advanced analytics.

### Should Not Be Done

- Long-form IDP document builder.
- Duplicating player identity into IDP.
- Duplicating video clip metadata into IDP.
- Building inside `app.js` or Squad.
- Gamification, points, badges, leaderboards.

### Needs More Information

- Final staff role names for owner/support responsibilities.
- Whether review cadence defaults should be club-wide, team-wide, or coach-set.
- Whether Phase/Principle IDs should come from current static constants first or
  wait for Identity/Game Model database ownership.
- Whether early MVP should surface legacy Squad IDP fields as read-only migration
  context.

## 13. Implementation Roadmap

| Phase | Outcome |
| --- | --- |
| 0. Documentation and ownership | Complete this packet, confirm module/release owner, and choose database-first path. Recommendation: database-first because Video Analysis is already database-primary and IDP evidence needs permissions. |
| 1. Contracts and schema | Add IDP to module/platform contracts, permission matrix, and module standard. Create `idp_*` migration with RLS, grants, indexes, audit, soft delete, row versions, and clip-bank idempotency. Add schema/security tests. |
| 2. API and domain layer | Add `/api/idp`, repositories, services, constants, domain normalizers, and guard tests that prevent direct Supabase calls from UI components. |
| 3. MVP UI | Build dashboard, player card, current focus, next action, clip bank, evidence, review, timeline, and ownership panels with targeted browser smoke. |
| 4. Video automation | Wire Video Analysis player-tag events to IDP clip bank through a service/API boundary with idempotency and no-clutter tests. |
| 5. Reviews and timeline | Add lightweight review completion, milestone creation, overdue review actions, and missing-evidence actions. |
| 6. Production release | Run Safe Lane validation, deploy only from clean passing state, and verify MVP flow on live data. |

## MVP Definition Of Done

MVP is complete when a coach can open IDP dashboard, see every player's current
focus, open a player, understand the work, see automatically collected clip-bank
items, mark a clip as evidence, add a short note, set or complete a review, see
the next action, and read the player's development timeline.

The MVP succeeds only when the coach can understand the player's development
state without asking anyone.
