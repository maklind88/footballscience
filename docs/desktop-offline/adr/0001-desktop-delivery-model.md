# ADR-0001: Desktop frontend delivery model

Status: Proposed — do not accept until Windows packaged evidence passes

Date: 2026-08-30

## Context

FS is a frequently deployed static web product with Vercel APIs and Supabase. Desktop must preserve ordinary web update speed while providing true cold-start access to selected offline content. Hosted code must not receive broad native capabilities, and unsynchronized domain work must be independent of frontend cache lifecycle.

## Proposed decision

Use Tauri 2 with the trusted hosted FS origin as the primary frontend delivery path (Candidate A), backed by a deliberately small versioned offline shell and last-known-good compatibility behavior.

Keep native capabilities behind one typed, domain-oriented DesktopBridge. Remote access is deny-by-default and every allowed command is restricted by origin, window, input schema, and command-specific permission.

Use Candidate B only as a fallback if packaged Windows/WebView2 evidence shows that Candidate A cannot meet cold-start or security requirements. Do not build Candidate C.

## Evidence

- packaged Tauri/WKWebView hosted service-worker control passed on Apple Silicon macOS;
- hosted cold start passed after the origin server was confirmed unreachable;
- online/offline/online transition passed in one packaged process;
- origin-scoped two-command native bridge passed;
- bundled local-asset startup passed;
- current live FS does not yet have the required fetch/cache worker;
- Windows evidence is absent, so this ADR remains proposed.

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

## Rejected alternative

Candidate C is rejected because it creates a second executable-code update system while A and B already work mechanically. Its signing, atomic activation, rollback, compatibility, and anti-downgrade surface is not justified.

## Acceptance criteria

- Windows x64 packaged cold start succeeds with origin unavailable;
- Windows same-process online/offline recovery succeeds;
- a remote origin can call only the intended spike commands;
- production cache design demonstrates compatibility gating and last-known-good retention;
- authenticated session ownership design is accepted before native sync implementation.
