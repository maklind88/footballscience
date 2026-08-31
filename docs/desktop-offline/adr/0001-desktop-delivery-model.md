# ADR-0001: Desktop frontend delivery model

Status: Provisionally accepted for local implementation — not production-ready

Date: 2026-08-30; provisional acceptance 2026-08-31

## Context

FS is a frequently deployed static web product with Vercel APIs and Supabase. Desktop must preserve ordinary web update speed while providing true cold-start access to selected offline content. Hosted code must not receive broad native capabilities, and unsynchronized domain work must be independent of frontend cache lifecycle.

## Decision

Use Tauri 2 with the trusted hosted FS origin as the primary frontend delivery path (Candidate A), backed by a deliberately small versioned offline shell and last-known-good compatibility behavior.

Keep native capabilities behind one typed, domain-oriented DesktopBridge. Remote access is deny-by-default and every allowed command is restricted by origin, window, input schema, and command-specific permission.

Keep Candidate B as the viable fallback if later physical Windows, production-origin service-worker, or compatibility evidence shows that Candidate A cannot meet cold-start or security requirements. Do not build Candidate C.

## Evidence

- packaged Tauri/WKWebView hosted service-worker control passed on Apple Silicon macOS;
- hosted cold start passed after the origin server was confirmed unreachable;
- online/offline/online transition passed in one packaged process;
- origin-scoped two-command native bridge passed;
- bundled local-asset startup passed;
- Windows Server 2025 x64 CI compiled three unsigned, unbundled release executables from commit `0b1eb419f9a0c0cbb4fb7175b05b82f9625ac0bc`;
- WebView2 `151.0.4129.101` hosted startup, service-worker control across process restart, synthetic offline cold restart, and recovery passed;
- the known but ungranted native command was rejected;
- a granted command invoked from an unauthorized loopback origin was rejected by Tauri ACL;
- all existing static/security, API-contract, and four browser-shard web QA jobs passed in the same workflow run;
- current live FS does not yet have the required fetch/cache worker;
- the Windows evidence is headless CI evidence, not physical Windows or installer evidence.

Evidence reference: [FS Desktop Windows Architecture Verification run 33355879972](https://github.com/maklind88/footballscience/actions/runs/33355879972) and `docs/desktop-offline/WINDOWS_CI_EVIDENCE.md`.

## Security implications

- hosted frontend compromise can invoke only explicitly allowed narrow commands;
- no arbitrary filesystem, path, shell, SQL, process, or generic HTTP capability is allowed;
- frontend assets and compatibility manifests cannot authorize native installer trust;
- the native updater must independently verify signed artifacts;
- the refresh token requires one secure session authority, not webview and Rust refreshers racing;
- medical and other highly sensitive data remain online-only initially.

## Consequences

Positive:

- ordinary compatible web deployments remain the normal product path;
- browser and desktop share the same product code and backend behavior;
- offline data/storage can evolve behind explicit repository and sync contracts;
- the native runtime remains small and infrequently released.

Costs:

- FS needs a carefully versioned service-worker/application-shell strategy;
- compatibility and health checks are required before new hosted builds displace the last-known-good shell;
- hosted XSS remains a product-security risk even when system access is bounded;
- macOS and Windows webview behavior must be tested separately.
- physical Windows, installer, signing, secure credential storage, and updater behavior remain production-readiness work.

## Rejected alternative

Candidate C is rejected because it creates a second executable-code update system while A and B already work mechanically. Its signing, atomic activation, rollback, compatibility, and anti-downgrade surface is not justified.

## Provisional acceptance criteria and remaining gates

- Passed in Windows CI: x64 unbundled release compilation and hosted cold restart with the synthetic origin unavailable.
- Passed in Windows CI: same-process synthetic online/offline/online recovery.
- Passed in Windows CI: only the two intended commands are granted; an ungranted command and an unauthorized origin are rejected.
- Required before the real hosted shell replaces this spike: compatibility gating, health confirmation, and last-known-good cache retention.
- Required before native auth/sync implementation handles credentials: one session authority and real Windows Credential Manager integration.
- Required before any new synchronization schema: reconcile and document the `60` repository / `49` production / `48` staging migration histories.
- Required before production availability: physical Windows testing, installer UX, signing/SmartScreen, real network switching, sleep/wake, update installation/rollback, and physical restart behavior.

The first three criteria provisionally close the delivery-model architecture gate. The remaining items are implementation and production-readiness gates and must not be represented as passed by headless CI.
