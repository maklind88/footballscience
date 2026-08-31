# ADR-0002: Privileged desktop content origin

Status: Accepted for local implementation; Windows CI passed, physical-device gates remain

Date: 2026-08-31

## Context

The earlier architecture spike served privileged WebView content from fixed loopback port `47844`. A fixed or randomly allocated localhost server adds port ownership, startup ordering, request parsing, loopback interception, origin/cookie/CORS and firewall behavior to the trusted surface. A random port also needs an authenticated discovery channel and makes a stable capability origin harder to express.

Candidate A already has a native asset registry. Starting a second HTTP server solely to expose those bytes is unnecessary.

## Decision

Serve privileged application code through Tauri custom protocols:

- `fs-active` is bound to native window label `main` and serves only the bundled bootstrap plus the verified active generation;
- `fs-candidate` is bound to hidden/incognito window label `candidate` and serves only the exact staged candidate;
- `fs-recovery` is bound to window label `recovery` and serves only the bundled read-only recovery UI;
- every handler allows only `GET`/`HEAD`, uses an exact path allowlist or signed manifest lookup, disables caching, applies `nosniff`, a restrictive CSP, frame denial and no cross-origin allowance;
- navigation, new-window and download callbacks fail closed;
- capabilities are disjoint by window label, and native commands repeat the role/origin check rather than relying on ACL configuration alone.

Tauri custom-protocol origins differ by platform. The navigation callback accepts the exact registered `fs-<role>://localhost` request before platform translation. macOS/Linux retain that origin; Windows maps it to Tauri/WebView2's internally intercepted `http://fs-<role>.localhost` virtual origin. The Windows form is not a localhost listener. `use_https_scheme(true)` is deliberately not enabled because Tauri documents that the HTTPS custom-protocol form blocks mixed HTTP content, which includes its internal IPC transport. Scheme and host lookalikes, arbitrary HTTPS pages, auth providers and product links cannot navigate a privileged window.

The synthetic release source on `127.0.0.1:47842` is only a test publication endpoint. It is never a privileged WebView content origin and is not the proposed production publication URL.

## Alternatives

Fixed localhost was rejected for privileged content because it adds a listener and stable port to the attack surface. Random localhost was rejected because it adds discovery/authentication complexity without improving native asset ownership. Bundled-only remains Candidate B fallback evidence but would bind every frontend delivery to a native release.

## Evidence and remaining gates

Rust origin tests cover macOS- and Windows-shaped custom origins, reject the Windows HTTPS lookalike, and enforce external-navigation denial. A packaged Apple Silicon macOS build loaded the signed active generation through the custom protocol. [Windows CI run 33451341546](https://github.com/maklind88/footballscience/actions/runs/33451341546) then loaded Candidate A through WebView2's intercepted `http://fs-active.localhost` and `http://fs-candidate.localhost` virtual origins, completed signed activation and IPC, and rejected both the ungranted native command and a command attempted from `http://127.0.0.1:47843`. The runner exposed no privileged localhost listener for these virtual origins.

The preceding Windows runs deliberately failed closed while the registered custom-scheme request, Windows virtual-origin translation and synthetic hosted-source path guard were isolated. Commit `6ee92acc` fixed the final Windows-only 404 by replacing a slash-specific containment test with `path.relative` and adding POSIX/Windows path contracts. A hosted runner is still not physical Windows evidence. Installer, SmartScreen, sleep/wake, real adapter switching, physical Credential Manager and physical restart remain manual gates.

Official behavior references:

- https://docs.rs/tauri/latest/tauri/struct.Builder.html#method.register_uri_scheme_protocol
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.use_https_scheme
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html#method.on_navigation
