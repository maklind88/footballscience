# Secure Desktop Authentication Foundation

Date: 2026-09-23

Status: implemented and verified with local synthetic/provider-contract tests. It is not configured against staging or production and has not been deployed.

## Decision

The desktop WebView does not instantiate Supabase Auth and never receives a real access or refresh token. The native Rust process owns sign-in, refresh rotation, access-token memory, secure refresh-token storage and authorization revocation. The signed frontend receives only a verified identity/profile snapshot, a bounded offline lease and the opaque marker `desktop-native-session-v1` needed by the existing web auth contract.

This intentionally differs from the browser platform. The browser keeps its existing Supabase JS flow unchanged. Supabase JS persists sessions by default and supports custom storage, but a WebView storage adapter would still make refresh material reachable from downloaded JavaScript. Supabase refresh tokens are long-lived, rotate on use and participate in reuse detection, so native custody is the safer desktop boundary. Tauri's CSP guidance also recommends avoiding remote CDN content. Sources: [Supabase JavaScript auth](https://supabase.com/docs/reference/javascript/auth), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout), [Tauri CSP](https://v2.tauri.app/security/csp/).

## Implemented trust flow

```text
Signed active WebView
       |
       | typed auth/API commands; opaque session marker only
       v
Native SessionAuthority
       |-- access token: memory only
       |-- refresh token + verified identity lease: OS credential vault
       |-- exact HTTPS origin + route/method allowlist
       v
/api/desktop-auth and existing bounded /api routes
       |
       | server validates Supabase JWT and resolves current active membership
       v
Server-verified actor / organization / team partition
```

The new `/api/desktop-auth` handler supports only `sign-in`, `refresh`, non-enumerating `reset-password` and local-scope `sign-out`. Username lookup stays server-side. Sign-in and every refresh validate the returned access token and derive the active actor, organization and team from server-owned identity tables. Client metadata is display input only and cannot grant a role or partition.

The native API proxy accepts only an exact route/method allowlist, JSON bodies, bounded request/response sizes and a compile-time API origin. Production builds require HTTPS. Loopback HTTP is accepted only in a test build. Redirects, arbitrary URLs, arbitrary methods, generic native HTTP and non-JSON payloads are rejected.

## Credential and offline behavior

- Access tokens are held only in Rust memory.
- Refresh tokens and the verified identity lease use macOS Keychain or Windows Credential Manager through the credential-vault adapter.
- Browser `localStorage`, IndexedDB, SQLite, logs, native bridge results and signed code bundles contain no refresh token.
- Restart can restore a still-valid verified identity lease for offline reads, but cannot synchronize until native refresh succeeds.
- Logout clears local credential slots even if the remote sign-out request is unavailable.
- Account switch removes the former account credential.
- Refresh-token rotation is serialized and verified before the previous slot is removed.
- A changed actor/organization/team/partition, inactive identity, HTTP 401 or HTTP 403 during refresh revokes local authority.
- Revocation locks reads/sync without deleting quarantined pending user work.

The default offline lease remains a compile-time policy bounded to 5 minutes through 7 days; the current default is 24 hours. Product/security ownership must approve the production duration and device-loss policy before real rollout.

## Locally verified

- sign-in returns a server-verified partition;
- refresh rotates both tokens and revalidates membership;
- sign-out uses Supabase local scope and local credentials are always cleared;
- account switch removes the old secure credential;
- restart restores identity/profile without restoring an access token;
- expired or changed authorization fails closed;
- concurrent refresh callers share one rotation owner;
- late refresh cannot resurrect logout, revocation or a replaced account;
- signed active origin receives auth/API capabilities, while candidate/recovery origins are denied;
- JSON `Request` bodies and empty HTTP 204 responses cross the bridge correctly;
- the full signed pack installs the desktop auth bridge before the unchanged web auth boot;
- the web platform still retains its original Supabase browser flow.

The Rust HTTP client is exercised against a local bounded mock service. The server handler is exercised with synthetic Supabase and identity dependencies. No real Supabase project, user or remote database was contacted.

## Known limitations and next gate

- `FS_DESKTOP_API_ORIGIN` is intentionally not configured for a real environment.
- No real provider-backed login, refresh, membership revocation or account switch has been run.
- Physical macOS Keychain verification is an intentionally ignored opt-in test because it writes a real credential entry. Windows Credential Manager remains a physical Windows gate.
- The JSON API proxy covers the existing JSON routes, but `FormData`, binary upload/download, signed storage transfers and chat/profile/video attachments are not supported by this bridge.
- Supabase Realtime consumers currently see no Supabase browser client in desktop mode. Existing API polling/fallback paths may work online, but private channel collaboration, presence and realtime chat require a separate bounded native or server-mediated design.
- This phase does not make all product data available offline. Only the existing bounded Session Planner projection/outbox is durable offline.
- No new synchronization schema or migration was created. The 60/49/48 migration ledger remains a hard prerequisite for any such work.
- Full repository QA is currently blocked by a pre-existing Session Planner central-state browser failure that reproduces on checkpoint `47438631`; the desktop auth-specific, Rust, repository contract and packaged macOS gates are green.
- No staging, production, installer, release, signing or publishing action was performed.

The next authorized test should use an isolated non-production API/Supabase environment with disposable accounts and no production data. It must prove login, rotation, offline restart, membership revocation, account switch and logout before the origin is considered releasable.
