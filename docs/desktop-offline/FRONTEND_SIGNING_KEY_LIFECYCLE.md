# Frontend signing-key lifecycle

Status: local control design; no production key exists in this repository

Date: 2026-08-31

## Roles and custody

Candidate A uses two independent Ed25519 verification roles:

- a release key signs monotonically increasing ordinary frontend releases;
- a recovery key may sign an explicitly authorized lower-sequence recovery release.

Only public raw 32-byte keys and bounded key IDs are compiled into the native binary. A private key must never enter Git, a desktop build, an uploaded artifact, a log, a frontend asset, a Vercel/Supabase environment or a developer-facing manifest.

The current local generator creates test keys under the OS/runner temporary directory with mode `0600`. Those keys are synthetic, non-production, outside the repository and excluded from artifacts. A production implementation must replace this with protected CI or external signing/HSM custody, isolated from ordinary build jobs.

## Rotation

1. Add the new release public key to a reviewed native version while retaining the old key for a bounded overlap period.
2. Release and verify the native version through the normal native signing/distribution process.
3. Publish a higher-sequence frontend release signed by the new key.
4. Observe adoption and last-known-good health across supported native versions.
5. Remove the old key only in a later native version after the retention/adoption window proves that removal cannot strand supported clients.

The manifest and detached envelope must name the same key ID. Unknown IDs fail before manifest trust. Key IDs are never an authorization substitute; the pinned public key is the trust anchor.

## Revocation and compromise

If a release key is suspected compromised:

1. stop publication and freeze mutable pointers;
2. preserve manifests, signatures, asset digests, access/audit evidence and supported native-version mapping;
3. identify the highest potentially attacker-controlled sequence;
4. ship a native trust-store update that removes the compromised key and, when needed, raises a minimum accepted sequence;
5. use the separately held recovery role only with an expiring, reason-coded signed authorization whose `authorizedFromSequence` covers the highest observed sequence;
6. verify last-known-good and offline-data preservation before restoring publication;
7. document affected versions, artifacts, timelines and user action.

A mutable `latest` pointer cannot revoke already trusted code. Revocation requires a native trust/sequence response.

## Recovery authorization

Remote downgrade is denied by default. A recovery manifest is accepted only when all of these hold:

- detached signature verifies with the pinned recovery key, not the ordinary release key;
- target sequence equals the manifest sequence and is below the highest seen sequence;
- `authorizedFromSequence` is at least the native highest-seen sequence;
- authorization has not expired;
- reason code is bounded;
- normal compatibility and asset-integrity checks still pass.

The highest-seen sequence is never lowered by recovery. This prevents a recovery event from reopening ordinary rollback.

## Retention

The client retains active and previous generations plus quarantined metadata needed for diagnosis/backoff. Publication storage must retain every supported immutable manifest, detached signature and exact asset set for the supported native-version window and incident/legal policy. Mutable pointers may change, but immutable release paths must never be overwritten or reused.

Private signing material must follow a separately approved key-retention/destruction policy and must never be retained as a build artifact.
