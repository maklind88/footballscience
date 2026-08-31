# FS Desktop Signed-Delivery and Offline Prototype

This directory is an isolated local Tauri 2 prototype. It preserves the web platform and uses only synthetic identity/data. It is not an installer, production updater, deployed desktop app or real synchronization client.

## Candidate A: controlled frontend code delivery

A bundled native bootstrap fetches an immutable manifest and detached Ed25519 signature from the synthetic loopback publication source on port `47842`. Native code verifies the exact manifest bytes before parsing, pins the public verification key at compile time, validates every declared asset and stages it outside the WebView.

The native registry owns `candidate`, `active` and `previous` generations, the highest-seen release sequence, native/schema/sync/capability compatibility, nonce/deadline correlation, quarantine/backoff and atomic promotion. An older remote release is denied unless it carries a bounded recovery authorization signed by a distinct pinned recovery key.

Privileged content is not served from localhost. It uses role-specific Tauri custom protocols:

- `fs-active` / `http://fs-active.localhost` for the native bootstrap and active signed generation;
- `fs-candidate` / `http://fs-candidate.localhost` for a hidden/incognito compatibility-only candidate;
- `fs-recovery` / `http://fs-recovery.localhost` for bundled read-only recovery.

macOS/Linux and Windows use different custom-origin shapes. The Windows form is Tauri/WebView2's internally intercepted virtual HTTP origin, not a network listener. It deliberately retains Tauri's default scheme so its internal IPC endpoint is not blocked as mixed content. Exact scheme, host, role, window label and navigation checks account for both; HTTPS lookalikes, new windows, downloads and arbitrary external navigation are denied.

The shell cache is `fs-desktop-native-shell-cache-v2`. It is an app-data filesystem/SQLite registry, not browser/PWA Cache Storage and not a service worker. It contains only signed public code assets; token, auth, private JSON, user football, medical and outbox data are forbidden.

## Candidate isolation

The hidden candidate receives exactly three native commands: compatibility status/nonce, confirmation and sanitized failure reporting. It receives no session authority, token, SQLite, domain, outbox, active-shell or recovery privilege. Promotion requires five native-denial checks plus the exact nonce, staged build, release sequence, window and origin. Timeout or interruption quarantines the candidate while the active generation and domain/outbox state remain intact.

The active, candidate, recovery and bundled windows have separate Tauri capabilities. `withGlobalTauri` is false; frontend code imports frozen typed wrappers and no generic invoke wrapper is exported. Native handlers repeat the exact role/origin validation.

## Offline slice and local sync boundary

SQLite local schema v3 contains one normalized synthetic Session Planner projection, stable block/player/exercise references, an atomic outbox, durable acknowledgement receipts and an authorization quarantine sidecar. Two explicit version-1 mutation contracts (`session.rename`, `block.duration.set`) exercise atomic projection/outbox behavior below the read-only UI.

The branch includes a fail-closed authenticated handler, a private additive Postgres draft and disposable synthetic database. Local E2E reads the selected slice through that contract, normalizes it into file-backed SQLite, performs two offline edits, restarts, safely replays a lost acknowledgement and converges at revision 9. No real database adapter or remote schema is configured.

The current identity is synthetic, but SessionAuthority uses real macOS Keychain and Windows Credential Manager adapters for secure refresh custody. Rotation is serialized and durable, account switch/logout/revocation are bounded, and lease duration is compile-time configurable. The frontend receives credential-free actor/organization/team/partition/epoch/lease context only.

## Test signing

`npm run release:test:generate` creates ignored immutable releases and public build metadata under `generated/`. Test private keys are generated with mode `0600` under the OS/runner temporary directory, outside the repository and uploaded artifacts. The tool refuses `FS_DESKTOP_PRODUCTION_RELEASE=true`. Production signing custody and protected signing CI are not implemented.

## Verification

```bash
npm ci
npm test
cd src-tauri && cargo test --lib --locked
npm run tauri:build:hosted
npm run tauri:build:bundled
npm run tauri:build:unauthorized-origin
```

The historical `hosted` identifier is retained in scripts for continuity; it now means Candidate A signed code delivery, not a privileged arbitrary website.

`tauri build --no-bundle` produces an unsigned local executable, not an installer. The synthetic source runs with `npm run host:hosted`. The Windows workflow builds unsigned executables, exercises WebView2 and uploads sanitized evidence without production credentials or private signing keys.

## Explicit limitations

- no production/staging Supabase schema, data or environment change;
- no production signing, publication, deployment, installer, notarization or updater;
- no real authentication provider or account data;
- macOS Keychain is locally verified with a synthetic secret; Windows Credential Manager remains compile/contract-only pending physical verification;
- no configured/deployed synchronization database adapter;
- no encryption-at-rest claim;
- no physical Windows, real adapter switching, sleep/wake, SmartScreen or physical restart claim.
