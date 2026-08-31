# Desktop Delivery and Offline Vertical-Slice Architecture Spike

Date: 2026-08-31

Status: local architecture gate provisionally closed; production-readiness gate open

## Scope and truth boundary

The spike now proves a bounded Session Planner offline slice as well as the delivery mechanics. It does not connect a real FS account, use production data, add a Supabase migration or endpoint, persist a refresh token, publish an installer, sign an executable, or deploy anything.

Candidate A and Candidate B share the same Tauri/Rust core. Candidate A is the primary delivery model. Candidate B is retained as rebuildable fallback evidence, not as a second continuously developed product.

## Candidate A — native bootstrap with verified hosted shell generations

Candidate A no longer relies on a browser service worker. A stable frontend bundled into the native binary asks Rust to fetch a manifest and assets from the single configured update source `http://127.0.0.1:47842` used by the spike. Rust, rather than downloaded JavaScript, controls trust and activation.

The native bootstrap:

- accepts one exact, non-redirecting source origin;
- checks frontend build ID, native app compatibility, sync protocol version, local-schema version and declared capabilities;
- verifies every asset path, byte count, content type and SHA-256 before it can be staged;
- serves only bundled or verified assets from the exact internal WebView origin `http://127.0.0.1:47844`;
- stores `candidate`, `active` and `previous` generations in native app-data, outside browser/PWA Cache Storage;
- promotes a candidate atomically only after a nonce-bound application-ready confirmation and preserves the prior generation;
- retains the active last-known-good generation when a candidate is incompatible or the source is offline.

There is no desktop service worker and no unconditional `skipWaiting`. The shell allowlist excludes tokens, authenticated API responses, medical data, private football data and user data. Domain data and pending mutations live in the local projection/outbox, not in the shell cache.

## First offline vertical slice

The selected Session Planner session contains normalized session metadata, ordered blocks, player references, exercise references and tenant/organization/team partition context. The approximately 3.10 MB canonical planner document is explicitly excluded.

The packaged shell renders the selected projection read-only. SQLite schema v2 stores the bounded projection plus an atomic outbox and durable acknowledgement receipts. Contract tests cover typed rename/duration operations, transaction rollback, close/reopen persistence, accepted-response loss, idempotent replay, acknowledgement-before-delete and unauthorized partition rejection. The UI is intentionally not yet writable.

`SessionAuthority` is native-owned in shape but synthetic in this phase. It supplies actor, organization, team, partition, authentication epoch and bounded offline lease without using frontend `localStorage` or storing a refresh token in SQLite. OS credential-vault integration and real token refresh remain unimplemented gates.

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

[Run 33397533148](https://github.com/maklind88/footballscience/actions/runs/33397533148) verified exact commit `03524459614364fe1754af143e5d40e3c228700c` on Windows Server 2025 AMD64 with WebView2 `151.0.4129.101`:

- Candidate A, Candidate B and the unauthorized-origin probe compiled as release executables;
- Candidate A WebView2 startup, native generation persistence across process restart, incompatible-candidate rejection and last-known-good restart passed;
- synthetic online → offline, offline process restart and offline → online recovery passed;
- the local Session Planner projection loaded after restart;
- Candidate B WebView2 startup without network dependency passed;
- unauthorized origin and unauthorized native command paths were rejected;
- native Rust tests, desktop contract tests, static/security gates, API contracts and all four Chromium regression shards passed;
- an unsigned, checksummed evidence artifact was generated; no installer or release was produced.

The Windows runner is a hosted VM. It does not prove physical Windows behavior, installer UX, sleep/wake, real adapter switching, Credential Manager, signed update UX, SmartScreen or a physical OS restart.

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

Candidate A remains the recommended architecture for the next local implementation phase. Candidate B remains a viable fallback only. Candidate C remains unjustified.

The local architecture gate can be provisionally closed because the same bounded slice passed packaged macOS verification and isolated Windows CI, including cold restart, reconnect, compatibility rejection, LKG retention, local projection persistence, bridge restrictions and existing web regression.

This is not production acceptance. Before any public desktop build, Candidate A still needs real auth and secure credential storage, logout/account-switch/revocation behavior, a reviewed real sync boundary, encryption and data-retention decisions, a native candidate watchdog/quarantine path for a compatible build that never reports ready, physical Windows verification, installer/signing/SmartScreen work, sleep/wake and real-network testing.

## Supabase and synchronization boundary

The `60` repository / `49` production / `48` staging histories are now reconciled in `MIGRATION_RECONCILIATION.md`; no history was repaired and no remote object was changed. The trusted future baseline is the reviewed logical ledger plus catalog evidence, not any count by itself.

The recommended public sync boundary is a narrow authenticated Vercel handler that derives identity and scope server-side and later calls one private transactional Postgres routine. Direct desktop-to-Supabase RPC remains a conditional fallback only if it preserves the same authorization, version isolation, observability and idempotency. A new server is not justified.
