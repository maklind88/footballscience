# FS Desktop Offline Vertical-Slice Prototype

This directory is an isolated local Tauri 2 prototype. It preserves the existing web platform and uses only synthetic identity/data. It is not an installer, production updater, deployed desktop app, or real synchronization client.

## Candidate A

The preferred candidate uses a native-controlled bootstrap at `http://127.0.0.1:47844` and a fixed synthetic shell source at `http://127.0.0.1:47842`.

Native code, not downloaded JavaScript, controls:

- exact source origin and redirect rejection;
- immutable frontend build ID;
- native version requirement;
- local schema and sync protocol versions;
- required native capability subset;
- bounded asset list, byte limits and SHA-256 integrity;
- candidate/active/previous generation registry;
- application-ready evidence and atomic promotion.

The shell cache is an app-data filesystem/SQLite registry named `fs-desktop-native-shell-cache-v1`. It does not use the browser/PWA Cache Storage or a service worker. Only six immutable application-code assets are present. No auth response, token, callback, private JSON, signed URL, user football data or medical data is stored in the shell generation.

A running active shell stages a compatible update for the next controlled restart; it does not replace itself while running. Failed download, integrity, compatibility or application-ready checks do not replace the active generation, and the previous generation remains retained.

## Offline slice

SQLite local schema v2 contains one normalized synthetic Session Planner projection, stable block/player/exercise references, an atomic outbox and durable acknowledgement receipts. The packaged UI reads the selected session offline and remains read-only.

Two explicit version-1 mutation contracts (`session.rename`, `block.duration.set`) exercise atomic projection/outbox behavior below the UI. An in-process trusted-server test double models tenant authorization, operation allowlisting, revisions, idempotency and accepted-response-loss recovery. No real server endpoint exists.

The synthetic native Session Authority exposes a credential-free snapshot and validates actor, organization, partition, auth epoch, offline lease and frontend compatibility for every session read/write command. It neither stores nor issues a real token.

## Native capability boundary

The hosted capability is attached only to the exact `http://127.0.0.1:47844` scheme/host/port origin. Tauri's required URL path matcher is `/*`; no scheme, host or port wildcard is used. The hosted config names only that capability, preventing broad default overlap.

Enumerated commands:

- `desktop_runtime_info`
- `desktop_bootstrap_status`
- `desktop_prepare_shell_update`
- `desktop_confirm_shell_candidate`
- `desktop_session_authority`
- `desktop_read_selected_session`
- `desktop_apply_session_operation`
- `record_spike_probe`

There is no generic SQL, filesystem, path, HTTP, shell or process command. `internal_denied_probe` is compiled but deliberately ungranted. A separate unauthorized-origin build proves that even a granted command is rejected from `http://127.0.0.1:47843`.

Candidate B is a reproducible bundled fallback smoke target with only runtime-info/probe permissions. It is not maintained as a second feature-equivalent desktop product.

## Verification

```bash
npm ci
npm test
cd src-tauri && cargo test --lib --locked
npm run tauri:build:hosted
npm run tauri:build:bundled
npm run tauri:build:unauthorized-origin
```

`tauri build --no-bundle` produces an unsigned local executable, not an installer. The hosted synthetic source runs with:

```bash
npm run host:hosted
```

The Windows workflow builds the three unsigned executables, runs Node and Rust contracts, exercises WebView2 lifecycle/LKG/origin checks, runs the existing full web QA workflow and uploads sanitized evidence.

## Explicit limitations

- no production/staging Supabase schema or data change;
- no real authentication, Keychain or Windows Credential Manager adapter;
- no real synchronization endpoint or real account data;
- no encryption-at-rest claim;
- no installer, signing, notarization, updater or public release;
- no physical Windows, real network switching, sleep/wake, SmartScreen or physical restart claim.
