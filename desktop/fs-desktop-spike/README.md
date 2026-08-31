# FS Desktop Delivery-Model Spike

This is a disposable Phase 2 architecture spike. It is not a production desktop application, installer, updater, local database, or release channel.

The spike compares two delivery mechanics without changing the web platform:

- `hosted`: a trusted HTTP origin inside Tauri with a network-first service worker and cached cold-start shell;
- `bundled`: frontend assets embedded in the Tauri binary.

Both candidates use the same tiny `DesktopBridge` contract. The native runtime exposes only:

- `desktop_runtime_info`;
- `record_spike_probe`.

There is no filesystem, shell, SQL, generic HTTP, process, or arbitrary-path command. `build.rs` registers an explicit Tauri `AppManifest`, and the hosted capability is restricted to `http://127.0.0.1:47842/*`.

## Locked dependencies

- Tauri CLI `2.11.4`
- Tauri JavaScript API `2.11.1`
- Rust Tauri crate `2.11.5`
- `tauri-build` `2.6.3`
- Rust `1.98.0` was used for the macOS evidence run

The npm and Cargo lockfiles are committed with the spike.

## Verification commands

```bash
npm ci
npm test
npm run tauri:build:bundled
npm run tauri:build:hosted
```

The build commands require the current official Tauri prerequisites and Rust toolchain. `tauri build --no-bundle` intentionally produces an unsigned local binary only.

For the hosted probe:

```bash
npm run host:hosted
```

Run the hosted-configured binary once online, close it, stop the server, and run the same binary again. A sanitized result is atomically written to the operating-system temporary directory as `fs-desktop-spike-hosted.json`. The bundled candidate writes `fs-desktop-spike-bundled.json`.

## What the spike proves

- a packaged Tauri app builds and starts on the audited Apple Silicon macOS machine;
- WKWebView can retain the hosted origin's service worker between app processes;
- cached shell content can cold-start while the origin is unreachable;
- a running hosted app can detect and recover through online/offline transitions;
- a remote origin can be limited to two explicitly named native commands;
- concurrent access-token consumers can be serialized behind one session authority contract.

## What it does not prove

- Windows/WebView2 behavior;
- production `footballscience.xyz` offline behavior;
- authenticated offline data access;
- secure credential storage;
- SQLite, outbox, sync, conflicts, updater, signing, notarization, or installers;
- that all current FS assets are safe to cache.

The actual live FS service worker remains push-only. No production service-worker behavior was changed.
