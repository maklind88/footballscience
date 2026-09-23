# Full Platform Signed Bundle Evidence

Date: 2026-09-23

Status: implemented and verified locally on packaged Apple Silicon macOS; Windows verification for this revision is pending.

## What this checkpoint proves

Candidate A now packages the current Football Science web runtime as one deterministic, signed release bundle instead of maintaining a hand-built desktop-only HTML copy. The release input includes the tracked root runtime files, `src/**` and `assets/**`. Server code, API handlers, Supabase migrations, QA sources, documentation and environment/secrets files are excluded.

Inline scripts in `index.html` are deterministically externalized so the active desktop origin can retain a strict Content Security Policy. The generated scripts remain at the web root, preserving relative module-import semantics. The packager refuses unsafe paths, symbolic links, duplicate entries, unsupported MIME identities and configured file/header/total-size limits.

The native bootstrap accepts shell-manifest schema v3 with exactly one outer `.pack` asset. It verifies the detached Ed25519 manifest signature, outer bundle digest and size, canonical bundle index, every entry path, offset, size, MIME type and SHA-256 digest before atomic activation. Each served asset is checked against the signed index again. Existing schema-v2 generations remain readable as a bounded upgrade path, while v2/v3 contract mixing fails closed.

## Local packaged macOS evidence

The packaged application verified:

- signed full-platform activation on the private `fs-active://localhost` origin;
- proof from both JavaScript and native evidence that the real Football Science runtime reached `window.__footballScienceAppReady`;
- invalid signature, unknown key, post-signing bundle modification and incompatible candidate rejection with last-known-good retained;
- candidate timeout, quarantine and bounded backoff;
- last-known-good and quarantine persistence across process restart;
- online to source-unavailable cold start, another source-unavailable process restart and later online recovery;
- preservation of the active generation through reconnect.

The verifier uses a fresh isolated `fs-desktop-test-*` data root that is accepted only by a binary compiled with `FS_DESKTOP_TEST_BUILD=1`. It does not read or overwrite normal user app data. Automated WebView background timers are throttled on macOS, so source transitions are tested through deterministic process termination and cold restart. This proves application-process restart behavior, not sleep/wake, physical machine restart or real network-adapter switching.

Evidence is generated under `desktop/fs-desktop-spike/artifacts/macos/` and is intentionally ignored by Git. The local package is unsigned and unpublished. Test keys, synthetic identity and synthetic data are used; production credentials, data and signing keys are not used.

## What this checkpoint does not prove

The full visual/runtime code can load from the signed local bundle, but the application is not yet a fully functional offline copy of every Football Science feature.

- Real Supabase authentication is not enabled. The web runtime currently loads the Supabase browser SDK from a remote CDN and persists its session in browser storage; neither is acceptable for the desktop trust model.
- Relative `/api/**` calls do not yet have a typed desktop route to an explicit HTTPS API origin.
- The real web Session Planner is not yet wired to the native SQLite projection/outbox. The current planner projection and two mutations remain a synthetic bounded contract slice.
- Real user identity/profile hydration, refresh-token custody and offline lease policy are not connected to a non-production provider.
- No new synchronization schema or migration may be introduced until the documented repository/production/staging migration ledger is accepted for the next phase.
- Windows CI must be rerun for this full-platform bundle revision. Physical Windows verification remains separate.

## Required next gate

Before enabling real account traffic, implement and review one secure non-production identity/network slice:

1. vendor and pin the Supabase browser dependency, or remove it from the downloaded WebView runtime;
2. make native code the only refresh-credential owner through Keychain/Credential Manager;
3. expose only bounded identity/profile/lease facts to the active frontend;
4. route permitted `/api/**` operations through an explicit HTTPS origin and typed allowlist;
5. prove login, token rotation, logout, account switch, revocation and offline restart against an isolated non-production environment;
6. keep production credentials, service-role keys and production data out of the app and CI.

This is a security/data decision gate, not a reason to weaken the current CSP or place Supabase refresh material in WebView storage.
