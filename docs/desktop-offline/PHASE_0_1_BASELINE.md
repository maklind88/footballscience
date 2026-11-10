# FS Desktop and Offline Baseline

Status: Phase 0 complete; Phase 1 audit complete enough for the architecture gate

Audit date: 2026-08-30

Repository root: `/Users/maklind/Documents/New project`

Audit branch: `codex/fs-desktop-offline-phase0-2`

Baseline commit: `f6a5810d42340e2f2367802557b01c3ba56e4b11`

## Repository-root verification

The directory is the complete current Git worktree, not an `index.html` export:

- Git top level resolves exactly to the repository path above.
- `origin` is `https://github.com/maklind88/footballscience.git`.
- local `main` was fetched and fast-forwarded to the exact `origin/main` SHA above before the audit branch was created.
- the repository contains approximately 1,750 tracked files: modular frontend source, 23 top-level Vercel API handlers, shared API libraries, 60 local Supabase migrations, more than 500 QA files, release tooling, GitHub workflows, and an existing local-video desktop companion.
- there are no submodules, sparse checkout, or shallow-clone markers.

## Baseline verification

| Check | Result |
| --- | --- |
| Root `npm ci` | Passed; 47 packages; 0 audit vulnerabilities |
| `desktop/local-video-app` `npm ci` | Passed; 21 packages; 0 audit vulnerabilities |
| Static QA gate | Passed |
| Full Playwright suite | 2,524 passed; 1 environment-dependent workbook test skipped |
| Browser engine | Chromium through Playwright |
| Host | Apple Silicon, macOS 26.2 |
| Windows | Not run and not claimed |

The initial Playwright server bind was denied by the filesystem/network sandbox. The same existing suite was rerun with permission only for the loopback test server and then passed. No staging or production deployment ran.

## Current application stack

- No frontend framework is present. The product is static HTML, CSS, plain JavaScript, and browser ES modules.
- `index.html` is the single document shell. `app.js` is a six-line loader into `app-runtime.js`; feature code is increasingly split under `src/`.
- Navigation is client-side workspace state and query parameters, not framework routes.
- There is no SSR, React Server Components, Server Actions, or frontend build/bundle step.
- The primary deployment is a static Vercel root with CommonJS Vercel Functions under `api/`.
- Root Node is 24.x in Vercel and GitHub Actions. The audited machine used Node 24.15.0 and npm 11.12.1.
- There are no generated Supabase TypeScript database types and the product source is not TypeScript. Typed contracts will need explicit schemas rather than pretending raw JSON is typed.

## Server and deployment dependencies

The web document itself is static, but authenticated product behavior is server-dependent:

- `/api/client-config` provides browser-safe Supabase URL/anon-key configuration and the current frontend build ID.
- password login normally uses `/api/client-config` POST; a direct Supabase password-login fallback remains for selected proxy failures.
- the browser calls guarded same-origin endpoints for app state, identity, admin, audit, chat, medical/RTP, IDP, scouting, FSDB, leaderboard, profile images, squad ages, session history, push, gameplan briefs, and video analysis.
- service-role access is confined to server code under `api/_lib/supabase-admin.js`; no service-role key was found in browser or desktop source.
- direct client Supabase use is limited mainly to Auth, Chat/Video Realtime, and specific Storage operations such as chat attachments, signed attachment reads, and scouting import artifacts.
- Vercel runs a daily `/api/app-state-backup` cron at 08:00 UTC.

There are 18 GitHub workflows. Production deployment is manually dispatched, runs full QA and staging/live guards, builds an exact Vercel artifact, promotes it, then performs production verification. Staging is push/manual driven. The Supabase migration workflow verifies migration safety and remote state; it does not automatically apply local migrations.

No tracked `.env` or secret-bearing environment file was found. `.env*`, `.vercel`, and `supabase/.temp` are ignored. Runtime secrets live in Vercel/GitHub/Supabase environments. One ignored local `.vercel/.env.preview.local` exists and was not printed or copied.

## PWA and offline baseline

The manifest is installable and the product has browser-install UX. It is not currently an offline app shell:

- `manifest.webmanifest` defines standalone display, icons, `/` scope, and Home start URL.
- `footballscience-sw.js` handles install/activate, push, and notification clicks only. It has no `fetch` handler and no cache population.
- the chat push client registers this worker on `/` only when push functionality needs it.
- root and `index.html` are served with `no-store, no-cache`.
- startup fetches `/api/client-config` with `cache: no-store`, uses build IDs, and clears Cache Storage on a detected build change.
- many operational records are mirrored in `localStorage`, and data-safety snapshots use IndexedDB, but this is not a versioned SQLite cache or durable domain outbox.
- video analysis already uses IndexedDB for local handles, thumbnails, tracking workspaces, and benchmarks.

`docs/MOBILE_APP_SHELL.md` says no service worker is registered. The current code can register the push-only worker, so that sentence is stale even though its intended claim—no offline caching worker—is still true.

## Supabase baseline

Two healthy, authorized projects were inspected read-only:

| Environment | Project | Postgres | Public tables | RLS |
| --- | --- | --- | ---: | --- |
| Production | Football Science NCC (`bustidorxevacosqhkcz`) | 17.6 | 135 | Enabled on all 135 |
| Staging | Football Science Staging (`pokrksgempkuraueglpu`) | 17.6 | 135 | Enabled on all 135 |

Additional findings:

- each project exposes 143 listed tables when the eight Storage schema tables are included;
- production has 192 public RLS policies;
- authenticated client grants found in production are SELECT-only on 71 relations; no anon DML grants and no authenticated INSERT/UPDATE/DELETE grants were found;
- no public view lacking `security_invoker` and no public security-definer function executable by anon/authenticated was found;
- Realtime publication contains only Chat tables;
- no deployed Supabase Edge Functions are present;
- production security advisor returned no notices;
- staging reports one Auth warning: leaked-password protection is disabled. Its many `RLS enabled, no policy` information notices largely describe deliberately server-only tables with revoked client grants, not public exposure;
- production performance advisor reports extensive index debt (unused indexes and unindexed foreign keys), which is background platform work rather than a desktop blocker.

Storage buckets:

- `footballscience-app-state`: private;
- `footballscience-chat-attachments`: private, 50 MB and MIME restricted;
- `footballscience-profile-images`: public, 1 MB image restricted;
- `footballscience-rtp-exercise-media`: private, 500 MB image/video restricted.

No row bodies, credentials, tokens, or secret key values were included in this audit record.

## Central data-flow baseline

The current central compatibility path stores 18 production app-state documents for one organization. Their aggregate value size is about 7.37 MB. The largest are:

| Key | Approximate size | Current revision |
| --- | ---: | ---: |
| `football-session-planner-v3` | 3.10 MB | 14,451 |
| `football-medical-team-v1` | 1.92 MB | 11,406 |
| `football-player-profiles-v1` | 0.62 MB | 1,110 |
| Exercise Library primary | 0.58 MB | 197 |
| Exercise Library backup | 0.58 MB | 199 |
| `football-periodization-v2` | 0.21 MB | 2,600 |

The browser writes protected local keys through a data-safety runtime, queues central writes, stores IndexedDB snapshots, and uses revision-aware merge policies. This is valuable compatibility and recovery behavior, but the documents are too coarse for an FS-specific offline protocol: a single field edit can compete on a multi-megabyte document and there is no durable cross-process outbox.

The repository includes an additive Session Planner migration with typed session/block rows, deterministic IDs, row versions, archive-only deletion, audit versions, and tenant validation. That migration is not present in either current Supabase project. Neither production nor staging has the four `session_planner_*` relations. The files are undeployed groundwork, not active source of truth.

Local migration counts also drift from remote history: 60 files exist locally, production reports 49 migrations, and staging reports 48. Several logically equivalent app-state/medical/leaderboard migrations have environment-specific timestamps. Reconciliation is required before any new desktop schema is applied, but no database mutation is needed at the architecture gate.

## Authentication and session ownership

Current web behavior:

- `platform-auth-boot.js` downloads Supabase JS v2 from jsDelivr at runtime;
- it creates one Supabase client with `autoRefreshToken: true`, `persistSession: true`, and `detectSessionInUrl: false`;
- login sets both access and refresh token into that client;
- `refreshSession()` is serialized by one in-flight promise in the current page;
- API calls use the current short-lived bearer access token;
- global sign-out clears the browser session and Supabase-related local artifacts.

Consequently, the current refresh token is persisted in browser localStorage. That remains unchanged for the web platform. A desktop runtime must not add a second independent refresher. The proposed desktop direction is one native session authority backed by OS credential storage, with access-token brokerage to the hosted frontend and sync engine. This is proposed, not yet implemented or security-verified.

No OAuth, SSO, magic-link, or redirect/deep-link flow was found in the current product. Password login and password-reset email are the active flows.

## Existing native/local component

`desktop/local-video-app` is a mature loopback companion, not a full FS desktop shell. It binds to `127.0.0.1:47831`, validates approved origins and expiring capabilities, runs local FFmpeg/tracking jobs, keeps raw match video and absolute paths on-device, and only publishes explicitly checksum-verified portable reviews. This least-privilege model is useful prior art and should be integrated behind or remain adjacent to a future DesktopBridge rather than duplicated.

## Gate-level risks

1. The live FS shell cannot cold-start offline today.
2. Hosted shell caching must not precache the 16 MB scouting import or every media/data artifact. It needs a deliberately small versioned shell and lazy offline packs.
3. A compromised hosted frontend must never inherit generic native access.
4. Refresh-token ownership must be redesigned before a native sync engine exists.
5. Current app-state documents are too coarse for safe offline writes.
6. Medical, transfer, chat, and raw media data require stricter local policies than ordinary coaching plans.
7. Windows/WebView2 packaged behavior is still unverified.

## Verification status vocabulary

- Implemented: architecture spike and documentation only.
- Verified locally on macOS: existing web QA, packaged bundled startup, hosted service-worker control, offline cold start, online/offline transitions, two-command native bridge.
- Verified through Windows CI: nothing yet.
- Still requiring physical/manual Windows verification: installer behavior, WebView2 runtime behavior, sleep/wake, credential storage, network transitions, update UX, and packaged offline workflows.
