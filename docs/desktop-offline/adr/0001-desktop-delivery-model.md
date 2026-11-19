# ADR-0001: Desktop frontend delivery model

Status: Provisionally accepted for continued local hardening — not production-ready

Date: 2026-08-30; updated with local-slice evidence 2026-09-01 and security/evidence clarifications 2026-09-05

Review addendum 2026-09-05: see `../SECURITY_REVIEW_2026-09-05.md` for reproduced and corrected capability, refresh-lifecycle, rollback, storage and wire-contract gaps. The local architecture decision stands; prior green CI is not evidence for the subsequently changed implementation. Current SHA/run evidence belongs to PR #201. Production readiness remains open.

## Context

FS is a frequently deployed static web product with Vercel APIs and Supabase. Desktop must preserve that web platform while providing cold-start access to a selected offline slice. Downloaded frontend code must not decide its own native compatibility or receive broad system capabilities. Unsynchronized work must be durable and independent of frontend-cache replacement.

## Decision

Use Tauri 2 with a stable bundled bootstrap and native-controlled, signed frontend code delivery as the primary delivery model (Candidate A). Candidate A is not ordinary web hosting inside a privileged WebView: it is a code-supply chain with detached signatures, immutable releases, anti-rollback state, staged activation and last-known-good recovery.

Rust verifies the detached Ed25519 signature over the exact manifest bytes before parsing or trusting the manifest. Rust then owns asset path/size/content-type/SHA-256 validation, native/sync/local-schema compatibility, release sequence enforcement, capability declaration, nonce-bound health confirmation, atomic promotion, quarantine/backoff and `candidate`/`active`/`previous` state. The WebView sees bundled or verified assets only through role-specific custom protocols. Desktop shell storage is native app-data and is isolated from the browser/PWA service-worker namespace.

Expose only typed domain/bootstrap commands through an exact-origin DesktopBridge. Do not expose arbitrary filesystem paths, shell/process execution, SQL, generic HTTP or generic storage. Validate compatibility, `SessionAuthority`, partition, organization/team, operation type/version and payload natively.

Keep Candidate B as an archived/rebuildable fallback if physical Windows or real production-shell evidence later invalidates Candidate A. Do not maintain B as a feature-equivalent parallel product. Candidate C is not selected, but it is also not classified as having no obligations: Candidate A now accepts the same authenticity, immutable-artifact, anti-rollback, signing-key rotation/revocation, retention and incident-response duties that made a second updater unattractive.

## Accepted evidence

- packaged Apple Silicon macOS Candidate A passed verified promotion, online/offline/restart/online, incompatible-candidate rejection and LKG restart;
- its native cache retained active `hosted-spike-v11` and previous `hosted-spike-v10` independently of browser/PWA caches;
- the selected synthetic Session Planner projection survived cold restart and loaded read-only;
- atomic projection/outbox, accepted-response loss, close/reopen replay, durable acknowledgement and unauthorized-partition behavior passed Rust contracts;
- the synthetic native `SessionAuthority` supplies bounded identity/lease context without a refresh token in SQLite or frontend storage;
- packaged macOS Candidate B started without a network dependency;
- [Windows CI run 33499616167](https://github.com/maklind88/footballscience/actions/runs/33499616167) built and ran Candidate A, Candidate B and an unauthorized-origin executable from commit `d6df5e85dec615ffd2d0f8acd90ac146d119b222`;
- WebView2 `151.0.4129.101` passed signed custom-protocol activation, active-generation restart, compatibility/LKG, synthetic online/offline/restart/online and local-projection checks;
- Windows CI rejected invalid signatures, unknown keys, post-signing asset modification and an incompatible candidate without changing the active generation;
- Windows CI timed out and quarantined a hanging candidate, cleared its authority, retained active state and suppressed retry after process restart;
- unauthorized origin and unauthorized command attempts were rejected;
- static/security gates, API contracts and all four Chromium web regression shards passed in the same run;
- no existing browser/PWA service-worker source was changed.
- exact-manifest signature, unknown-key, modified-manifest, modified-asset, immutable-build-ID, rollback, candidate-isolation and quarantine contracts pass locally and, where applicable, in Windows CI;
- the native OS-vault SessionAuthority lifecycle verifies one refresh owner, durable two-slot rotation, account switch, logout, revocation and configurable offline lease in local contracts; Windows Credential Manager compiled but was not physically exercised;
- an isolated macOS Keychain test wrote, read and deleted one uniquely named synthetic credential;
- a synthetic JavaScript integration harness exercises the local handler, disposable Postgres routine and file-backed SQLite through selected-session, two-offline-edit, restart, lost-ack, replay and receipt-before-remove steps. It models the desktop client and is not proof of packaged Rust transport to a real backend; native Rust contracts are tested separately.

Windows CI is VM evidence, not physical-device, installer or Credential Manager evidence.

## Security and data implications

- shell cache contains only public static allowlisted assets; it excludes tokens, auth responses, medical data and private/user football data;
- hosted XSS can reach only explicitly granted typed commands and must still pass native identity, partition and operation checks;
- local projection/outbox holds only the selected bounded slice in this phase;
- refresh-token custody belongs to the OS-backed native session authority; the WebView and SQLite retain no second copy;
- medical and other highly sensitive data remain online-only until separately threat-modeled;
- promotion is fail-closed; a compatible candidate that never reports ready is closed by a native deadline, quarantined with bounded failure codes and exponential backoff, while active data and outbox state remain untouched.

## Consequences

Candidate A preserves ordinary compatible web delivery, avoids a second frontend product and gives the native runtime control of trust, rollback and offline state. Its costs are a native shell-generation subsystem, compatibility discipline, health monitoring and continuing separate macOS/Windows WebView verification.

Candidate B has simpler runtime delivery but would bind frontend fixes to native releases and risks product drift. A separate Candidate C rail would still duplicate signing, rollback and operational controls, so it is not selected. Candidate A itself is treated as signed code delivery and must satisfy those controls before distribution.

## Remaining gates

- Real non-production authentication integration and authorized server-owned credential configuration; only synthetic/local authentication is used now.
- Explicit allowed-data snapshots, verified session/lease restoration and the actual Rust transport/reconnect path before connecting real user data. Generic snapshot content and synthetic startup authority are not accepted real-data contracts.
- Acceptance/replay of the reconciled ledger and a separately authorized remote migration proposal; the endpoint/private routines exist only as fail-closed local code and additive drafts.
- Encryption-at-rest, retention, device-loss and local-data purge decisions.
- Production signing custody, protected signing CI, rotation/revocation drills, immutable publication and retention enforcement.
- Physical Windows installer, real network, sleep/wake, physical restart, signing/update and SmartScreen verification.
- Manual product UX, accessibility and operational recovery checks.
- Windows Credential Manager physical round trip; Windows code/contract compilation is not physical proof.

These items keep production readiness open; they do not reopen the local delivery decision unless new evidence contradicts Candidate A.

## Gate disposition

The architecture gate remains provisionally closed only for continued local implementation. Candidate A is primary, Candidate B is fallback evidence, and Candidate C is not selected as a separate rail. No deployment, release, installer publication, production signing, real credential use or Supabase change is authorized by this ADR.
