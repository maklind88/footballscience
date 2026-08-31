# Windows CI Architecture Evidence

Date: 2026-08-31

Scope: branch-only, unsigned architecture verification. No deployment, installer publication, production/staging secret, Supabase schema, privileged production data or real FS account was used.

## Immutable run reference

- Workflow: `FS Desktop Windows Architecture Verification`
- Accepted run: [33397533148](https://github.com/maklind88/footballscience/actions/runs/33397533148)
- Verified commit: `03524459614364fe1754af143e5d40e3c228700c`
- Branch: `codex/fs-desktop-offline-phase0-2`
- Runner image: `win25-vs2026`
- OS: Microsoft Windows Server 2025 Datacenter `10.0.26100`, AMD64
- WebView2 registry/runtime version: `151.0.4129.101`
- Production credentials/data used: no/no

An earlier attempt, run `33397328944`, correctly failed before compilation because Git checkout converted immutable shell assets to CRLF while their manifests described LF bytes. Commit `03524459` added a scoped `.gitattributes` rule for candidate assets. The accepted run proves the corrected cross-platform byte contract.

## Passed checks

| Check | Evidence | Result |
| --- | --- | --- |
| Existing web regression | Static/security gates, API contracts and four Chromium browser shards | Passed |
| Desktop contracts | Native-cache manifest, bridge and frontend contracts | Passed |
| Native contracts | Bootstrap, compatibility, authority, projection, outbox and replay Rust tests | Passed |
| Candidate A build/start | x64 release executable and actual WebView2 online startup | Passed |
| Candidate B build/start | x64 release executable and local-asset startup without network | Passed |
| WebView2 runtime | Installed runtime detected and actual Tauri/WebView2 processes exercised | Passed |
| Native cache generation | `fs-desktop-native-shell-cache-v1`; active generation persisted across process restart | Passed |
| Compatibility/LKG | schema `999` candidate rejected; `hosted-spike-v11` retained and restarted | Passed |
| Online → offline | loopback-only synthetic update source stopped; local projection remained | Passed |
| Offline restart | source confirmed unavailable; native active generation and projection reloaded | Passed |
| Offline → online | source restarted; same process recovered without using cached private payload | Passed |
| Candidate B minimal bridge | only its two intended commands granted | Passed |
| Unauthorized command | compiled but ungranted command rejected | Passed |
| Unauthorized origin | `http://127.0.0.1:47843` attempted `desktop_runtime_info`; ACL rejected it | Passed |
| Evidence generation | checksummed unsigned executables, JSON evidence and sanitized logs | Passed |

Failed checks in accepted run: none.

## Artifact

- Name: `fs-desktop-windows-architecture-33397533148`
- GitHub artifact ID: `9760498252`
- Compressed size: `18,371,849` bytes
- Artifact digest: `sha256:d09ff6074208208d888f7456424fc2c09e2aff37267d9cfef30581fc723abd5e`
- Retention expiry: `2026-09-14T13:49:38Z`
- Installer generated/published: no/no

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `fs-desktop-bundled.exe` | 15,045,120 | `e55a3dd97a0de1186e7d5c672590c46ec49159629893f86b302b205e7aa5663d` |
| `fs-desktop-hosted.exe` | 16,815,104 | `b31f2f844df8d54db2a31145fc7cb34ede01006c9b32a41e9a5efa09c33f1525` |
| `fs-desktop-unauthorized-origin.exe` | 16,815,104 | `68336b6e7f660821a2c30201ff4ab3d3fbadf1011e09ecdee41296ed7c2f8705` |

The artifact also contains `build-manifest.json`, `windows-runtime-environment.json`, `windows-runtime-evidence.json`, `unauthorized-origin-probe.json` and sanitized build/runtime logs.

## Truthful limitations

The GitHub-hosted runner is a Windows VM, not physical user hardware. Starting and stopping a loopback-only synthetic update source deterministically proves origin loss/recovery behavior; it does not simulate Wi-Fi/Ethernet hardware, captive portals, VPNs, proxies or intermittent networks.

Not verified by this run:

- installer, upgrade, uninstall, repair or recovery UX;
- sleep/wake, hibernation, lock or time change;
- real network adapter switching;
- Windows Credential Manager;
- signed update installation/rollback UX;
- code signing, reputation or SmartScreen;
- physical Windows reboot/restart;
- real FS auth, real synchronization endpoint or production-origin shell delivery.

## Remaining manual Windows checklist

1. Install, launch, upgrade, uninstall, reinstall and repair on supported physical Windows 11 hardware.
2. Repeat cold offline start and process restart with a real adapter disabled; recover across Wi-Fi/Ethernet, VPN/proxy and captive-portal conditions.
3. Exercise sleep, wake, hibernate, lock/lid and clock changes with pending work and active synchronization.
4. Implement and verify Credential Manager storage, serialized refresh, logout, account switch and revocation; no credential-storage claim exists yet.
5. Verify signed installer/update UX, rollback, interrupted update recovery, signing identity and SmartScreen/reputation after separate authorization.
6. Verify candidate timeout/quarantine plus LKG rollback with real FS shell version transitions.
7. Verify accessibility, keyboard use, scaling, multi-monitor placement and supported WebView2 update states.
8. Verify physical Windows restart with clean state and unsynchronized offline work.

## Conclusion

Candidate A remains primary and Candidate B remains a viable fallback. The local architecture gate is provisionally closed. Physical Windows verification remains a production-readiness gate. No migration or synchronization schema was introduced.
