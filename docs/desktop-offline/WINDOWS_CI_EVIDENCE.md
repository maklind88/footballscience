# Windows CI Architecture Evidence

Date: 2026-09-01

Scope: branch-only, unsigned architecture verification. No deployment, installer publication, production/staging secret, Supabase schema, privileged production data or real FS account was used.

## Immutable accepted run

- Workflow: `FS Desktop Windows Architecture Verification`
- Accepted run: [33499616167](https://github.com/maklind88/footballscience/actions/runs/33499616167)
- Verified commit: `d6df5e85dec615ffd2d0f8acd90ac146d119b222`
- Branch: `codex/fs-desktop-offline-local-integration`
- Runner image: `win25-vs2026`
- OS: Microsoft Windows Server 2025 Datacenter `10.0.26100`, AMD64
- WebView2 registry/runtime version: `151.0.4129.101`
- Production credentials/data/signing keys used: no/no/no

The earlier Phase 0–2 run `33397533148` proved the initial delivery candidates. The local-integration series then intentionally exercised a stricter signed-release, custom-protocol, candidate-isolation and quarantine path. Runs `33424220460`, `33428867278`, `33431518257`, `33434262180` and `33443309980` failed rather than overstating Windows support. Their traces isolated platform custom-origin translation and finally a portable-path bug in the synthetic hosted source: a POSIX-only `${root}/` containment check returned 404 for valid Windows paths. Commit `6ee92acc` replaced that check with `path.relative` containment and added both POSIX and Windows contract tests. Run `33451341546` was the first complete proof after those corrections. The accepted run above supersedes it by verifying the final writable Session Planner slice and the restored full web QA baseline on the exact pushed branch commit.

## Passed checks

| Check | Evidence | Result |
| --- | --- | --- |
| Existing web regression | Static/security gates, API contracts and four Chromium browser shards | Passed |
| Desktop contracts | 38 native-cache, signed-release, typed-write, bridge, private-routine and path-containment contracts | Passed |
| Native contracts | Bootstrap, compatibility, authority, projection, outbox, replay, quarantine and origin Rust tests | Passed |
| Candidate A build/start | x64 release executable and actual signed custom-protocol WebView2 activation | Passed |
| Candidate B build/start | x64 release executable and local-asset startup without network | Passed |
| WebView2 runtime | Installed runtime detected and actual Tauri/WebView2 processes exercised | Passed |
| Signed release trust | Valid detached signature accepted; invalid signature, unknown key and post-signing asset modification rejected | Passed |
| Native cache generation | `fs-desktop-native-shell-cache-v2`; active generation persisted across process restart | Passed |
| Compatibility/LKG | schema-incompatible candidate rejected; active `hosted-test-normal-s21-a93b794827e0` retained | Passed |
| Timeout/quarantine | hanging candidate timed out, candidate authority cleared, active generation preserved and backoff persisted | Passed |
| Quarantine restart | quarantined candidate was not retried after process restart | Passed |
| Online → offline | loopback-only synthetic update source stopped; local projection remained | Passed |
| Offline restart | source confirmed unavailable; native active generation and SQLite projection reloaded | Passed |
| Offline → online | source restarted; same process recovered with active generation unchanged | Passed |
| Candidate B minimal bridge | only its two intended commands granted | Passed |
| Unauthorized command | compiled but ungranted command rejected | Passed |
| Unauthorized origin | `http://127.0.0.1:47843` attempted `desktop_runtime_info`; ACL rejected it | Passed |
| Artifact safety | private-key guard passed; installer/release flags false; local common-secret-marker scan found no match | Passed |
| Evidence generation | checksummed unsigned executables, JSON evidence and sanitized logs | Passed |

Failed checks in the accepted run: none.

## Artifact

- Name: `fs-desktop-windows-architecture-33499616167`
- GitHub artifact ID: `9797664818`
- Compressed size: `19,259,873` bytes
- Artifact digest: `sha256:6d5d43f507c70f18da53275872f66b8ccfcfcd2169ee5fffc0511d2a8de10dba`
- Retention expiry: `2026-09-15T11:08:48Z`
- Installer generated/published: no/no

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `fs-desktop-bundled.exe` | 16,932,864 | `c27ca503d7e1902a598bd707f04fc42115500ec82d3d1112677b3e5c1fe788d9` |
| `fs-desktop-hosted.exe` | 16,958,976 | `48559e0d6d3259951b9769a336da333ab4e1bd533e6edd77bcf102c85b60d5aa` |
| `fs-desktop-unauthorized-origin.exe` | 16,898,048 | `46f68b00d2202434e32d47e99844f3193fa808187131b99cd9438917fd8cdf72` |

The artifact also contains `build-manifest.json`, `windows-runtime-environment.json`, `windows-runtime-evidence.json`, `unauthorized-origin-probe.json` and sanitized build/runtime logs. The evidence records `productionCredentialsUsed: false`, `productionDataUsed: false`, `productionSigningKeysUsed: false`, `installerGenerated: false` and `releasePublished: false`.

## Truthful limitations

The GitHub-hosted runner is a Windows VM, not physical user hardware. Starting and stopping a loopback-only synthetic update source deterministically proves origin loss/recovery behavior; it does not simulate Wi-Fi/Ethernet hardware, captive portals, VPNs, proxies or intermittent networks.

Not verified by this run:

- installer, upgrade, uninstall, repair or recovery UX;
- sleep/wake, hibernation, lock or time change;
- real network adapter switching;
- a physical Windows Credential Manager round trip;
- signed update installation/rollback UX;
- code signing, reputation or SmartScreen;
- physical Windows reboot/restart;
- real FS auth, real synchronization endpoint or production-origin shell delivery.

The Windows Credential Manager adapter compiled and its in-memory lifecycle contracts passed. That is implementation and CI compilation evidence, not a physical credential-store claim. Process restart was exercised; operating-system restart was not.

## Remaining manual Windows checklist

1. Install, launch, upgrade, uninstall, reinstall and repair on supported physical Windows 11 hardware.
2. Repeat cold offline start and process restart with a real adapter disabled; recover across Wi-Fi/Ethernet, VPN/proxy and captive-portal conditions.
3. Exercise sleep, wake, hibernate, lock/lid and clock changes with pending work and active synchronization.
4. Run the implemented Credential Manager adapter through write/read/rotation/logout/account-switch/revocation on physical Windows; confirm no credential enters WebView, SQLite or logs.
5. Verify signed installer/update UX, rollback, interrupted update recovery, signing identity and SmartScreen/reputation after separate authorization.
6. Verify candidate timeout/quarantine plus LKG rollback with real FS shell version transitions.
7. Verify accessibility, keyboard use, scaling, multi-monitor placement and supported WebView2 update states.
8. Verify physical Windows restart with clean state and unsynchronized offline work.

## Conclusion

Candidate A remains primary and Candidate B remains a viable fallback. The architecture gate is provisionally closed for continued local development. Physical Windows verification remains a production-readiness gate. No migration or synchronization schema was introduced or applied remotely.
