# Windows CI Architecture Evidence

Date: 2026-08-31

Scope: branch-only, unsigned architecture verification. No deployment, installer publication, production/staging secret, Supabase schema, or privileged production data was used.

## Immutable run reference

- Workflow: `FS Desktop Windows Architecture Verification`
- Run: [33355879972](https://github.com/maklind88/footballscience/actions/runs/33355879972)
- Verified commit: `0b1eb419f9a0c0cbb4fb7175b05b82f9625ac0bc`
- Branch: `codex/fs-desktop-offline-phase0-2`
- Runner image: `win25-vs2026`
- OS: Microsoft Windows Server 2025 Datacenter `10.0.26100`, AMD64
- WebView2 registry version: `151.0.4129.101`
- Production credentials used: no
- Production data used: no

## Passed checks

| Check | Evidence | Result |
| --- | --- | --- |
| Existing web regression | Static/security gates, API contracts, and four Chromium browser shards | Passed |
| Desktop contract suite | 12 tests, including exactly two granted commands and a valid Windows resource icon | Passed |
| Candidate A | Hosted release build and WebView2 online startup | Passed |
| Candidate B | Bundled release build and local-asset startup without network dependency | Passed |
| Windows compilation | Three x64 release executables | Passed |
| WebView2 runtime | Installed runtime detected and actual Tauri/WebView2 processes exercised | Passed |
| Versioned service worker | Cache `fs-desktop-hosted-shell-v3`; control retained after process restart | Passed |
| Online → offline | Loopback origin stopped; cached payload served | Passed |
| Offline process restart | Origin confirmed unavailable; service worker controlled cold restart | Passed |
| Offline → online | Loopback origin restarted; same process recovered network payload | Passed |
| Restricted bridge | Only `desktop_runtime_info` and `record_spike_probe` granted | Passed |
| Unauthorized command | Compiled `internal_denied_probe` omitted from permissions and rejected | Passed |
| Unauthorized origin | `http://127.0.0.1:47843` attempted granted `desktop_runtime_info`; ACL rejected it | Passed |
| Evidence upload | Checksummed unsigned executables, JSON evidence, and logs | Passed |

Failed checks in the accepted run: none.

## Artifact

- Name: `fs-desktop-windows-architecture-33355879972`
- GitHub artifact ID: `9745232216`
- Compressed size: `9,213,466` bytes
- Artifact digest: `sha256:d5b1dfbe7f1f7e64725a1d7cbcb50f20ea0f8968352ca8c54493d19ec7b15652`
- Retention expiry: 2026-09-14T04:13:06Z
- Installer generated: no
- Artifact or release published: no

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `fs-desktop-bundled.exe` | 8,484,864 | `4a7693a43671daaaf95247685e8d6771eb20155018134d82b4c1aaafe7a3e632` |
| `fs-desktop-hosted.exe` | 10,231,296 | `955ccba67c5a088df5e3cdbee6bf4e2c19b103151e8a0530f45ed3810806ac53` |
| `fs-desktop-unauthorized-origin.exe` | 10,231,296 | `08d36b7cb758545fd4799bec555861ded016a040a6cf4c569a79adf846f10e71` |

The artifact also contains `build-manifest.json`, `windows-runtime-environment.json`, `windows-runtime-evidence.json`, `unauthorized-origin-probe.json`, and sanitized build/runtime logs.

## Truthful limitations

The GitHub-hosted runner is a Windows VM, not physical user hardware. Stopping and starting a loopback-only synthetic HTTP origin verifies application behavior under deterministic origin loss; it does not simulate a Wi-Fi/Ethernet adapter, captive portal, VPN, proxy, or flaky real network.

The run did not verify:

- installer, upgrade, uninstall, or recovery UX;
- sleep/wake or hibernation;
- real network switching;
- Windows Credential Manager;
- signed update installation or rollback UX;
- code signing, reputation, or SmartScreen behavior;
- physical Windows reboot/restart behavior;
- production-origin cache behavior with the real FS application shell.

## Remaining manual Windows checklist

1. Install, launch, upgrade, uninstall, reinstall, and repair on supported physical Windows 11 hardware.
2. Repeat cold offline start and process restart with a real network adapter disabled, then recover across Wi-Fi/Ethernet, VPN/proxy, and captive-portal conditions.
3. Exercise sleep, wake, hibernate, lid/lock transitions, and time changes while offline work is pending and while synchronization is active.
4. Implement and verify refresh-token protection, rotation, sign-out, and revocation with Windows Credential Manager; no credential-storage claim exists yet.
5. Verify signed installer/update UX, rollback, interrupted update recovery, code-signing identity, and SmartScreen/reputation behavior after credentials are separately authorized.
6. Verify cache compatibility gating and last-known-good rollback with real version transitions of the FS shell.
7. Verify accessibility, keyboard behavior, display scaling, multi-monitor placement, and supported WebView2/runtime update states on the physical device matrix.
8. Verify a physical Windows restart with both a clean state and unsynchronized offline work.

## Architecture conclusion

Candidate A remains the recommended delivery model because its Windows mechanism passed while preserving FS's existing web deployment model. Candidate B remains a viable fallback because its bundled startup and narrow bridge passed without a network dependency, at the cost of requiring native releases for frontend changes. Candidate C remains unjustified.

The delivery-model architecture gate is provisionally closed for local implementation. Physical Windows verification remains a production-readiness gate.

No migration or synchronization schema was introduced. The `60` repository / `49` production / `48` staging migration histories must be reconciled and documented before any such schema work begins.
