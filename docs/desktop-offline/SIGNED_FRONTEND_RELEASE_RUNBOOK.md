# Signed frontend release runbook

Status: local/test tooling only; production publication is not authorized

Date: 2026-08-31

## Immutable release contract

Each release has one unique release/build/frontend ID and a monotonically increasing sequence. The signed manifest binds native version requirement, local-schema version, sync-protocol version, exact capability set, issued timestamp, key ID and every asset path/size/content-type/SHA-256. The detached signature covers the exact manifest bytes before JSON parsing.

An immutable release directory contains:

- `manifest.json` — exact signed bytes;
- `manifest.sig` — detached Ed25519 envelope;
- only assets declared in the manifest.

Never edit, replace or reuse an existing immutable ID or sequence. A mutable pointer may select an immutable directory, but it is not authoritative and is never signed in place of the manifest.

## Local workflow

1. Run `npm run release:test:generate`.
2. Confirm `generated/test-release-public-env.json` says production credentials/data and private-key artifacts are false.
3. Run `npm test` and `cargo test --lib --locked`.
4. Build Candidate A through `npm run tauri:build:hosted`; the helper compiles only the public test keys.
5. Start the loopback synthetic source with `npm run host:hosted`.
6. Verify first promotion, active/previous registry, offline restart, reconnect, incompatible/invalid/unknown signature failure, timeout/quarantine and unauthorized origin/command behavior.
7. Preserve sanitized public evidence only. Never upload the OS temporary key directory.

The local signer refuses `FS_DESKTOP_PRODUCTION_RELEASE=true`. Passing local tests does not authorize production signing or publication.

## Future protected CI controls

A production release job must be separately authorized and should:

- build deterministic public assets before the signing boundary;
- calculate and review the exact manifest bytes/digest;
- sign through a protected environment/HSM or equivalent non-exportable key path;
- prevent pull-request/untrusted code from invoking signing;
- emit an immutable release path with retention lock/object versioning;
- verify the published bytes independently with the compiled public key;
- update the mutable pointer only after immutable verification;
- record release sequence, key ID, manifest digest, native compatibility and approver/audit identity;
- never expose a private key in environment dumps, caches, logs or artifacts.

## Failure handling

Missing/malformed signature, unknown key, signature failure, identity reuse, content mismatch, incompatible versions, unauthorized rollback or asset mismatch must leave the active generation unchanged. A compatible candidate that fails initialization is quarantined with a sanitized code and backoff. Active data, local projection and outbox are not deleted.

If no signed active/previous generation is valid, the native runtime opens the bundled read-only recovery state. Recovery does not grant writes, sync, token or activation authority.
