# Desktop Delivery Architecture Spike

Date: 2026-08-30

Status: macOS evidence complete; Windows gate open

## Scope

The spike compares delivery mechanics only. It deliberately does not add SQLite, sync tables, Supabase migrations, secure credentials, updater, signing, installer publication, or product UI.

The implementation lives in `desktop/fs-desktop-spike`. It uses current Tauri 2 packages and a temporary isolated Rust toolchain on the audited Mac.

## Candidate A — trusted hosted frontend

Prototype:

- a packaged Tauri window loads one explicitly trusted local HTTP origin standing in for the production HTTPS origin;
- the origin installs a small network-first service worker;
- the service worker caches only the shell, shared bridge contract, and one example payload;
- remote native access is restricted by Tauri capability URL and an explicit two-command `AppManifest`;
- a sanitized probe records whether boot used network or cache.

macOS results:

- online packaged launch: passed;
- service-worker control retained after closing/reopening the process: passed;
- origin server confirmed unreachable with `curl`: yes;
- packaged offline cold start after server shutdown: passed;
- same-process online → offline: passed;
- same-process offline → online recovery: passed;
- allowed native version/probe commands: passed;
- generic filesystem/shell/SQL/HTTP capability: absent;

This proves the delivery mechanism on WKWebView, not the live FS cache policy. The production worker remains push-only and the current shell would not pass the same test.

## Candidate B — bundled local frontend

Prototype:

- local frontend assets are embedded in the Tauri binary;
- the same two-command DesktopBridge is used;
- startup records a probe without contacting a server.

macOS result: packaged local-asset startup and native bridge passed. Offline reliability is inherently stronger, but every ordinary frontend change in this raw model requires a native release. That conflicts with FS's frequent web deployment model.

## Candidate C — separately signed frontend bundle

No executable-code updater was built. Candidate C would solve B's update delay at the cost of a second signed code-distribution, compatibility, atomic activation, rollback, and anti-downgrade system. A and B both worked at the mechanical level, so C is not justified at this gate.

## Decision matrix

| Criterion | A: hosted + offline shell | B: bundled frontend | C: signed frontend bundle |
| --- | --- | --- | --- |
| Ordinary web update speed | Best fit | Requires native release | Fast after a second update system exists |
| macOS offline cold start | Passed spike | Passed spike | Expected, not built |
| Windows offline cold start | Not yet tested | Not yet tested | Not tested |
| Remote/XSS native risk | Acceptable only with origin-scoped, narrow commands | Lower remote-origin risk | High supply-chain/update complexity |
| Native capability isolation | Passed two-command spike | Passed two-command spike | Would need the same bridge plus bundle verification |
| Current repo compatibility | Preserves live static app model | Would freeze frontend at installer version | Requires new frontend packaging pipeline |
| Recovery from broken web deploy | Versioned last-known-good cache required | Installed bundle remains stable | Explicit atomic rollback required |
| Preserve offline work | Feasible; work must live outside shell cache | Feasible | Feasible but updater must coordinate |
| Code duplication | Lowest if hosted UI remains primary | Risk of web/desktop drift | Low UI duplication, high platform duplication |
| Long-term complexity | Medium | Low runtime, high release friction | Highest |

## Provisional recommendation

Candidate A is the provisional fit, with these mandatory conditions:

1. desktop remote capability stays deny-by-default and command-specific;
2. the shell cache is small, versioned, health-checked, and compatibility-gated;
3. the previously compatible shell remains available until the new build proves healthy;
4. offline domain data and pending work live outside Cache Storage;
5. no broad native API is callable from hosted code;
6. the live push worker is evolved carefully or desktop caching gets an isolated, testable scope;
7. Windows packaged cold-start and capability tests pass before ADR acceptance.

Candidate B remains the recovery fallback if Windows/WebView2 or production-origin service-worker behavior fails. Candidate C remains rejected unless both A and B demonstrably fail the product requirements.

## Proposed session authority

The current browser client remains unchanged for web. Desktop should have one session authority, ultimately native-owned:

- native auth code stores the refresh credential in macOS Keychain or Windows Credential Manager;
- only that authority rotates the refresh token and serializes concurrent refreshes;
- frontend and sync consumers receive short-lived access tokens, never the persisted refresh token;
- sign-out clears/invalidates the authority and blocks sync;
- the webview Supabase client must not auto-refresh a second copy in desktop mode;
- Realtime and Storage integrations receive updated access tokens through explicit adapters.

The spike includes a unit-tested session-authority contract: twelve concurrent consumers cause one refresh and the consumer snapshot excludes the refresh token. Native secure storage and real Supabase integration are not implemented.

## Proposed first FS sync shape

For the Session Planner vertical slice:

- stable client/server UUIDs for session and block records;
- server-controlled row revision and cursor;
- pull snapshot/change page scoped by authorized organization/team and current working window;
- push operations with `operation_id`, `operation_type`, `operation_version`, entity ID, tenant scope, base revision, and validated payload;
- server-side idempotency record before acknowledgment;
- archive/tombstone instead of hard delete;
- local entity update and outbox insert in one SQLite transaction;
- outbox removal only after durable accepted/already-applied acknowledgment;
- Realtime only as a wake-up signal;
- snapshot fallback preserves and rebases the outbox.

No generic Postgres-to-SQLite replication is proposed.

## Supabase work required after the gate

No Supabase change was applied. Before implementation:

1. reconcile local/production/staging migration histories;
2. review and complete the undeployed Session Planner domain migration;
3. add versioned, tenant-checked idempotent sync operations and change cursor/tombstone contracts;
4. keep direct client grants minimal and RLS intentional;
5. expose sync through the same guarded server boundary unless direct Supabase access proves simpler without weakening authorization;
6. add cross-tenant, replay, malformed payload, stale revision, and revocation tests;
7. apply only to a local/branch or authorized staging environment before production.

## Gate still open

ADR acceptance is blocked on Windows evidence, not on a discovered security/data-loss defect. A Windows CI or physical Windows environment must build the exact spike and test WebView2 cold start, transition recovery, and remote capability denial. Installer/signing testing remains later Phase 11 work.
