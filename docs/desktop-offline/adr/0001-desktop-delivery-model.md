# ADR-0001: Desktop frontend delivery model

Status: Provisionally accepted for local implementation — not production-ready

Date: 2026-08-30; updated with complete local-slice evidence 2026-08-31

## Context

FS is a frequently deployed static web product with Vercel APIs and Supabase. Desktop must preserve that web platform while providing cold-start access to a selected offline slice. Downloaded frontend code must not decide its own native compatibility or receive broad system capabilities. Unsynchronized work must be durable and independent of frontend-cache replacement.

## Decision

Use Tauri 2 with a stable bundled bootstrap and native-controlled, verified hosted shell generations as the primary delivery model (Candidate A).

Rust owns the fixed source origin, asset integrity, native/sync/local-schema compatibility, capability declaration, health confirmation, app-ready promotion and `candidate`/`active`/`previous` state. The WebView sees only bundled or verified assets at one exact internal origin. Desktop shell storage is native app-data and is isolated from the browser/PWA service-worker namespace.

Expose only typed domain/bootstrap commands through an exact-origin DesktopBridge. Do not expose arbitrary filesystem paths, shell/process execution, SQL, generic HTTP or generic storage. Validate compatibility, `SessionAuthority`, partition, organization/team, operation type/version and payload natively.

Keep Candidate B as an archived/rebuildable fallback if physical Windows or real production-shell evidence later invalidates Candidate A. Do not maintain B as a feature-equivalent parallel product. Do not build Candidate C.

## Accepted evidence

- packaged Apple Silicon macOS Candidate A passed verified promotion, online/offline/restart/online, incompatible-candidate rejection and LKG restart;
- its native cache retained active `hosted-spike-v11` and previous `hosted-spike-v10` independently of browser/PWA caches;
- the selected synthetic Session Planner projection survived cold restart and loaded read-only;
- atomic projection/outbox, accepted-response loss, close/reopen replay, durable acknowledgement and unauthorized-partition behavior passed Rust contracts;
- the synthetic native `SessionAuthority` supplies bounded identity/lease context without a refresh token in SQLite or frontend storage;
- packaged macOS Candidate B started without a network dependency;
- [Windows CI run 33397533148](https://github.com/maklind88/footballscience/actions/runs/33397533148) built and ran Candidate A, Candidate B and an unauthorized-origin executable from commit `03524459614364fe1754af143e5d40e3c228700c`;
- WebView2 `151.0.4129.101` passed active-generation restart, compatibility/LKG, synthetic online/offline/restart/online and local-projection checks;
- unauthorized origin and unauthorized command attempts were rejected;
- static/security gates, API contracts and all four Chromium web regression shards passed in the same run;
- no existing browser/PWA service-worker source was changed.

Windows CI is VM evidence, not physical-device, installer or Credential Manager evidence.

## Security and data implications

- shell cache contains only public static allowlisted assets; it excludes tokens, auth responses, medical data and private/user football data;
- hosted XSS can reach only explicitly granted typed commands and must still pass native identity, partition and operation checks;
- local projection/outbox holds only the selected bounded slice in this phase;
- refresh-token custody must belong to one future OS-backed native session authority; the WebView and SQLite must not retain a second copy;
- medical and other highly sensitive data remain online-only until separately threat-modeled;
- promotion is fail-closed, but a compatible candidate that never reports ready still requires a native timeout/quarantine policy before production.

## Consequences

Candidate A preserves ordinary compatible web delivery, avoids a second frontend product and gives the native runtime control of trust, rollback and offline state. Its costs are a native shell-generation subsystem, compatibility discipline, health monitoring and continuing separate macOS/Windows WebView verification.

Candidate B has simpler runtime delivery but would bind frontend fixes to native releases and risks product drift. Candidate C would add a second signed code-update system with atomicity, rollback and anti-downgrade obligations that are not justified.

## Remaining gates

- Real native auth adapter using Keychain/Credential Manager, one refresh owner, logout/account switch and offline revocation policy.
- Reviewed Vercel sync endpoint/private transactional Postgres design, after the reconciled migration ledger is accepted; no schema exists yet.
- Encryption-at-rest, retention, device-loss and local-data purge decisions.
- Candidate ready-timeout/quarantine and real FS shell/version rollout evidence.
- Physical Windows installer, real network, sleep/wake, physical restart, signing/update and SmartScreen verification.
- Manual product UX, accessibility and operational recovery checks.

These items keep production readiness open; they do not reopen the local delivery decision unless new evidence contradicts Candidate A.

## Gate disposition

The architecture gate is provisionally closed for the next local implementation phase. Candidate A is primary, Candidate B is fallback evidence, and Candidate C is rejected. No deployment, release, installer publication, real credential use or Supabase change is authorized by this ADR.
