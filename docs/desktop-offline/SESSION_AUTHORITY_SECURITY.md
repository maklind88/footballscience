# Native SessionAuthority Security Contract

Date: 2026-08-31

Status: locally implemented; macOS Keychain round trip verified with a synthetic secret. Windows Credential Manager code and lifecycle contracts compile, but physical Windows credential-store verification remains pending.

## Ownership boundary

The native `SessionAuthority` is the only refresh-token owner. The active frontend receives identity/scope, authorization state and lease status, but no access token or refresh token. Candidate code receives none of those fields. SQLite, outbox rows, browser local storage and generated release artifacts contain no refresh credential.

The adapter uses the mature Rust `keyring` v4 abstraction with native macOS Keychain and Windows Credential Manager stores. Refresh/access strings are wrapped in zeroizing memory containers. OS-store error messages are sanitized and never include credential content.

## Durable rotation

Each account has two OS-vault slots. A rotation:

1. locks the single native refresh owner;
2. rechecks access-token validity after acquiring that lock, so concurrent callers share one refresh;
3. loads the highest valid credential generation;
4. writes the next generation to the alternate slot;
5. reads it back and verifies account, generation and token bytes;
6. updates the in-memory access token;
7. removes the previous slot only after the new slot is verified.

An interrupted write can therefore leave two generations, but startup selects the highest valid generation. A malformed slot fails closed. Operation and identity snapshots never serialize either token.

## Account, logout, lease and revocation behavior

- Account activation stores the new refresh credential before replacing in-memory authority.
- Account switching zeroizes the prior access token, deletes both prior refresh slots and replaces the visible partition/identity as one authority update.
- Logout attempts both secure-slot deletions, zeroizes access memory, clears visible identity/partition fields and locks offline access.
- Revocation performs the same cleanup and marks the authority revoked.
- An expired offline lease denies local reads but does not delete SQLite, receipts or pending outbox work.
- Authorization rejection can add a bounded sidecar quarantine record to a pending operation. Quarantined operations are retained but excluded from resend selection.

## Lease policy

The prototype default remains 24 hours for continuity with the accepted checkpoint, but it is not a permanent product decision. Builds may set `FS_DESKTOP_OFFLINE_LEASE_SECONDS`; native code clamps the configured duration to five minutes through seven days. Runtime/frontend content cannot extend it.

Shorter leases reduce the time a revoked or lost device can read cached data but increase the probability that coaches lose offline access during travel or connectivity failure. Longer leases improve offline availability but increase revocation exposure. A production value requires an owner-approved threat/risk decision, device-lock assumptions, revocation telemetry and physical Windows/macOS usability testing.

## Evidence

- 12 concurrent refresh callers cause exactly one refresh/rotation.
- New credential generation is read back before the prior slot is removed.
- Account switching removes the old secure credential and no old actor/partition remains in the snapshot.
- Logout/revocation clears access and secure refresh state.
- Expired lease denies native context validation while a durable outbox row remains.
- Revoked authority quarantines a pending operation without deleting it.
- macOS Keychain: a uniquely named synthetic secret was written, read byte-for-byte, deleted and confirmed absent.
- Windows: native backend compilation and in-memory lifecycle tests only; no physical Credential Manager claim.

No local/test token, test credential name or OS-vault value is committed to Git or uploaded as evidence.
