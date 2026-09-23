# Windows CI Architecture Evidence

Date: 2026-09-23

Current evidence: the accepted run below verifies the full-platform signed-bundle revision and hardened bounded Session Planner slice on its exact pushed SHA. The 2026-09-05 security review remains part of the evidence trail; see `SECURITY_REVIEW_2026-09-05.md`. This run does not prove a real-data writable desktop integration or physical Windows behavior.

Scope: branch-only, unsigned architecture verification. No deployment, installer publication, production/staging secret, Supabase schema, privileged production data or real FS account was used.

## Immutable accepted run

- Workflow: `FS Desktop Windows Architecture Verification`
- Accepted run: [35932204339](https://github.com/maklind88/footballscience/actions/runs/35932204339)
- Verified commit: `39749edd2debdb6c2e441eb91bc7d8879331b147`
- Branch: `codex/fs-desktop-offline-phase3-current-main`
- Runner image: `win25-vs2026`
- OS: Microsoft Windows Server 2025 Datacenter `10.0.26100`, AMD64
- WebView2 registry/runtime version: `153.0.4234.48`
- Production credentials/data/signing keys used: no/no/no

The earlier Phase 0–2 run `33397533148` proved the initial delivery candidates. The local-integration series then intentionally exercised a stricter signed-release, custom-protocol, candidate-isolation and quarantine path. Runs `33424220460`, `33428867278`, `33431518257`, `33434262180` and `33443309980` failed rather than overstating Windows support. Their traces isolated platform custom-origin translation and finally a portable-path bug in the synthetic hosted source: a POSIX-only `${root}/` containment check returned 404 for valid Windows paths. Commit `6ee92acc` replaced that check with `path.relative` containment and added both POSIX and Windows contract tests. Run `33499616167` then verified the bounded writable slice. The accepted run above supersedes those runs by verifying the current full-platform shell-manifest v3 payload, hardened auth/data contracts and restored full web QA baseline on the exact pushed branch commit.

## Passed checks

| Check | Evidence | Result |
| --- | --- | --- |
| Existing web regression | Static/security gates, API contracts and four Chromium browser shards | Passed |
| Desktop contracts | 53 native-cache, auth, signed-release, typed-write, bridge, private-routine, deterministic-bundle and path-containment contracts | Passed |
| Native contracts | 44 bootstrap, compatibility, authority, projection, outbox, replay, quarantine and origin Rust tests; one physical OS-vault test intentionally ignored | Passed |
| Candidate A build/start | x64 release executable and actual signed custom-protocol WebView2 activation | Passed |
| Candidate B build/start | x64 release executable and local-asset startup without network | Passed |
| WebView2 runtime | Installed runtime detected and actual Tauri/WebView2 processes exercised | Passed |
| Signed release trust | Valid detached signature accepted; invalid signature, unknown key and post-signing asset modification rejected | Passed |
| Native cache generation | `fs-desktop-native-shell-cache-v2`; active generation persisted across process restart | Passed |
| Compatibility/LKG | schema-incompatible candidate rejected; active `hosted-test-normal-s21-8efac8c26423` retained | Passed |
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

- Name: `fs-desktop-windows-architecture-35932204339`
- GitHub artifact ID: `10782585471`
- Compressed size: `19,899,131` bytes
- Artifact digest: `sha256:a01b831891e8464efeb2667b0b12ae7b1073845df42d5044896de1d299cb64c3`
- Retention expiry: `2026-10-07T23:28:50Z`
- Installer generated/published: no/no

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `fs-desktop-bundled.exe` | 17,546,752 | `7a3a1e84abf423b2a2eaa409b0ffe9f8cd2fe6ca24b00b53f6ee57023de641d8` |
| `fs-desktop-hosted.exe` | 17,622,528 | `11512e76877aadc60e2d33cb8e0176b7b5c5d3d42360a76c0fc7cf446baaf974` |
| `fs-desktop-unauthorized-origin.exe` | 17,545,728 | `b3c59492646a91a9de28b0fbc95be3b45443964153e991627b7f7102d4581ae5` |

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
