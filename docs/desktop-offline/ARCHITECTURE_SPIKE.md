# Desktop Delivery and Offline Vertical-Slice Architecture Spike

Date: 2026-08-31

Status: local architecture gate provisionally closed; production-readiness gate open

## Scope and truth boundary

The spike now proves a bounded Session Planner offline slice and a realistic local handler/Postgres boundary as well as the delivery mechanics. It does not connect a real FS account, use production data, add a deployable Supabase migration, configure a real endpoint/database adapter, publish an installer, sign an executable, or deploy anything.

Candidate A and Candidate B share the same Tauri/Rust core. Candidate A is the primary delivery model. Candidate B is retained as rebuildable fallback evidence, not as a second continuously developed product.

## Candidate A — native bootstrap with signed frontend code delivery

Candidate A no longer relies on a browser service worker. A stable frontend bundled into the native binary asks Rust to fetch a detached signature, exact manifest bytes and assets from the synthetic source `http://127.0.0.1:47842`. That loopback endpoint is test publication only, not a privileged content origin or proposed production URL. Rust, rather than downloaded JavaScript, controls trust and activation.

The native bootstrap:

- verifies the detached Ed25519 signature over the exact manifest bytes before parsing or trusting JSON;
- accepts one exact, non-redirecting synthetic source origin;
- checks frontend build ID, native app compatibility, sync protocol version, local-schema version and declared capabilities;
- verifies every asset path, byte count, content type and SHA-256 before it can be staged;
- serves bundled/active/candidate/recovery bytes through role-specific Tauri custom protocols, with platform-specific exact origins and no privileged localhost listener;
- stores `candidate`, `active` and `previous` generations in native app-data, outside browser/PWA Cache Storage;
- enforces a persistent highest-seen release sequence; ordinary rollback fails closed and recovery requires a distinct signed authorization;
- runs the candidate in a hidden/incognito compatibility-only window with three commands and no token/domain/SQLite/outbox authority;
- promotes a candidate atomically only after nonce/build/window/origin/deadline binding and complete negative privilege evidence;
- quarantines timeout/interruption with bounded failure codes and backoff while preserving active data and outbox state;
- retains the active last-known-good generation when a candidate is incompatible or the source is offline.

There is no desktop service worker and no unconditional `skipWaiting`. The shell allowlist excludes tokens, authenticated API responses, medical data, private football data and user data. Domain data and pending mutations live in the local projection/outbox, not in the shell cache.

## First offline vertical slice

The selected Session Planner session contains normalized session metadata, ordered blocks, player references, exercise references and tenant/organization/team partition context. The approximately 3.10 MB canonical planner document is explicitly excluded.

The packaged shell renders the selected projection read-only. SQLite schema v3 stores the bounded projection plus an atomic outbox, durable acknowledgement receipts and a sidecar quarantine that preserves unauthorized pending work while excluding it from resend. Contract tests cover typed rename/duration operations, transaction rollback, close/reopen persistence, accepted-response loss, idempotent replay, acknowledgement-before-delete, expired leases and unauthorized partition/revocation behavior. The UI is intentionally not yet writable.

`SessionAuthority` is native-owned and backed by macOS Keychain/Windows Credential Manager adapters. The local identity remains synthetic, but secure rotation, one-refresh-owner serialization, account switch, logout, revocation and bounded configurable lease behavior are implemented. The frontend receives no token; SQLite/outbox/browser storage receive no refresh token. A real auth provider remains unconfigured.

## Candidate B — bundled fallback evidence

Candidate B embeds the local frontend and starts without any network dependency. It retains only the minimal two-command spike bridge and passed packaged macOS startup and Windows WebView2 startup. It is viable recovery evidence, but keeping it feature-equivalent would make ordinary frontend changes depend on native releases and create product drift. It therefore remains an archived/rebuildable fallback, not a parallel delivery rail.

## Verification results

### macOS, verified locally

On Apple Silicon macOS with a packaged application:

- verified Candidate A download, health confirmation and application-ready promotion passed;
- online → offline, cold process restart with the source stopped, and offline → online recovery passed;
- an incompatible local-schema candidate was rejected while active `hosted-spike-v11` and previous `hosted-spike-v10` remained intact;
- restart while the incompatible source remained reachable loaded the active last-known-good shell and local projection;
- the selected revision-7 synthetic session projection loaded with partition validation;
- Candidate B rebuilt and started without a network dependency;
- origin `http://127.0.0.1:47843` was denied access to a command granted only to the trusted origin.

### Windows, verified through GitHub Actions CI

[Run 33451341546](https://github.com/maklind88/footballscience/actions/runs/33451341546) verified exact commit `a5c15425f0e44c389361e689ac4593f9043e5184` on Windows Server 2025 AMD64 with WebView2 `151.0.4129.101`:

- Candidate A, Candidate B and the unauthorized-origin probe compiled as release executables;
- Candidate A signed custom-protocol activation, native generation persistence across process restart, incompatible-candidate rejection and last-known-good restart passed;
- invalid signatures, unknown signing keys and post-signing asset modification were rejected without changing the active generation;
- a hanging candidate timed out, was quarantined with backoff, lost candidate authority and was not retried after process restart;
- synthetic online → offline, offline process restart and offline → online recovery passed;
- the local Session Planner projection loaded after restart;
- Candidate B WebView2 startup without network dependency passed;
- unauthorized origin and unauthorized native command paths were rejected;
- native Rust tests, all 34 desktop contract tests, static/security gates, API contracts and all four Chromium regression shards passed;
- an unsigned, checksummed evidence artifact was generated; no installer or release was produced.

The Windows runner is a hosted VM. It does not prove physical Windows behavior, installer UX, sleep/wake, real adapter switching, a physical Credential Manager round trip, signed update UX, SmartScreen or a physical OS restart. The earlier failing integration runs are retained as negative evidence; the last failure was a Windows-path 404 in the synthetic hosted server, corrected by portable `path.relative` containment and explicit POSIX/Windows tests in `6ee92acc`.

## Decision matrix

| Criterion | A: verified hosted generations | B: bundled frontend | C: separately signed bundle |
| --- | --- | --- | --- |
| Compatible web update speed | Best fit | Requires native release | Fast only after building a second updater |
| macOS packaged cold restart | Passed | Passed | Not built |
| Windows CI cold restart | Passed with synthetic source unavailable | Startup passed without network | Not built |
| Broken/incompatible shell recovery | Active/previous/candidate and LKG passed | Installed binary remains stable | Would need a second atomic rollback system |
| Native attack surface | Exact origin plus typed commands | Smallest remote-origin surface | Adds updater/supply-chain surface |
| Browser/PWA isolation | Native cache; no desktop SW | Embedded assets | Would need explicit isolation |
| Product/release drift | Lowest | High if kept feature-equivalent | Highest operational complexity |

## Decision

Candidate A remains the recommended architecture for the next local implementation phase. Candidate B remains a viable fallback only. Candidate C is not selected as a separate rail, but Candidate A is now explicitly governed as a code-supply chain and accepts authenticity, anti-rollback, immutable artifact, key lifecycle, retention and incident-response obligations.

The local architecture gate can be provisionally closed because the same bounded slice passed packaged macOS verification and isolated Windows CI, including cold restart, reconnect, compatibility rejection, LKG retention, local projection persistence, bridge restrictions and existing web regression.

This is not production acceptance. Before any public desktop build, Candidate A still needs real non-production auth/provider wiring, physical verification of OS credential storage and lifecycle behavior, a reviewed real sync boundary, encryption and data-retention decisions, production signing custody/protected publication, physical Windows verification, installer/signing/SmartScreen work, sleep/wake and real-network testing. Candidate timeout/quarantine now has local and Windows CI fault-injection evidence, but still needs real-shell and physical-device verification.

## Supabase and synchronization boundary

The `60` repository / `49` production / `48` staging histories are now reconciled in `MIGRATION_RECONCILIATION.md`; no history was repaired and no remote object was changed. The trusted future baseline is the reviewed logical ledger plus catalog evidence, not any count by itself.

The recommended public sync boundary now exists locally as a fail-closed authenticated Vercel handler plus private Postgres snapshot/apply routines and a dedicated minimum executor role. It is verified only against a disposable synthetic PGlite database; the default handler has no real database adapter. Direct desktop-to-Supabase RPC remains a conditional fallback only if it preserves the same authorization, version isolation, observability and idempotency. A new server is not justified.
