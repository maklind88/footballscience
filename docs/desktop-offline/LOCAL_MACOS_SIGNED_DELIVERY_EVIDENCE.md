# Local macOS signed-delivery evidence

Date: 2026-08-31

Environment: Apple Silicon macOS; unsigned, unpublished local Tauri `.app` bundle

Scope: synthetic release keys, synthetic identity and synthetic Session Planner projection only. No production credential, production data, remote Supabase environment, installer, release or deployment was used.

Machine-readable evidence: `desktop/fs-desktop-spike/artifacts/macos/macos-packaged-evidence.json` (local ignored QA artifact)

## Final packaged verification

The verifier launched the actual binary inside `FS Desktop Architecture Spike.app` against a loopback-only synthetic signed-release source. All ten checks passed:

1. exact-byte Ed25519 signed generation `hosted-test-normal-s36-b05719491482`, including the writable offline Session Planner UI asset, activated;
2. invalid detached signature rejected while the last-known-good generation remained active;
3. unknown signing key rejected while the last-known-good generation remained active;
4. post-signing asset modification rejected while the last-known-good generation remained active;
5. incompatible local-schema candidate rejected while the last-known-good generation remained active;
6. intentionally hanging candidate timed out, lost authority and entered persisted quarantine/backoff;
7. quarantine and last-known-good state survived a real application-process restart;
8. stopping the loopback source produced the offline state without losing the active generation;
9. the packaged process restarted offline and loaded the selected local projection;
10. restarting the source recovered online without changing the active generation.

Native evidence also confirmed:

- `fs-active://localhost` was the actual macOS content origin;
- candidate privilege isolation proof `fs-desktop-candidate-isolation-v1` was attached to the active generation;
- local schema `3`, sync protocol `1`, selected synthetic session revision `7` and partition validation;
- the intentionally compiled but ungranted native command remained rejected;
- browser/PWA service-worker control remained false;
- no production signing key was used or included in evidence.

The packaged startup proves that the signed UI module loaded and completed native initialization. Typed UI operation construction and status presentation are separately covered by frontend contracts; projection/outbox durability, restart and lost-ack replay are covered by Rust and local end-to-end tests. No claim is made that this packaged verifier physically clicked the edit controls.

## Defects found and corrected during verification

The first packaged run exposed that the native origin evidence used the standard URL-origin serialization, which is `null` for a custom scheme. Native evidence now records the exact scheme and host instead.

Subsequent negative runs exposed ambiguous frontend message matching: an unknown key and an oversized modified asset were initially not distinguished from transport failure, while a connection error containing `/manifest.json` could be mistaken for a manifest-compatibility error. The shared classifier now gives explicit transport failures priority and has regression tests for unknown keys, signatures, asset integrity/bounds and source unavailability.

Synthetic release sequences now reserve space above all negative candidates from the previous asset set. This prevents a changed local test asset from being mistaken for rollback after a higher-sequence timeout candidate has correctly advanced the anti-rollback high-water mark.

## Deliberate limitations

This evidence does not claim verification of:

- native installer UX, signing, notarization or update installation;
- macOS sleep/wake or physical machine restart;
- a physical network-adapter switch (the loopback source was stopped and restarted);
- real authentication or production synchronization;
- physical Windows, Windows Credential Manager, SmartScreen or Windows sleep/wake/restart.
