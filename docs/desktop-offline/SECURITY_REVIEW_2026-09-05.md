# Desktop security and integration review — 2026-09-05

Scope: isolated prototype hardening and refresh of draft PR #201. This is not production approval. No real authentication provider, backend connection, remote migration, installer or release is activated.

## Preserved source and ownership

- Verified remote base: `f63458a2cd86e9e974b1c244c8d57d32f338fae5`, Windows run `33558846039`.
- Review branch: `codex/fs-desktop-security-review-20260905`, created from that exact base in a separate worktree.
- Existing local `codex/fs-desktop-offline-local-integration` at `8189f3544be1d68af3d5e076e1b915a87ef0e52d` was rebased and contains a later Squad commit. It is preserved. Byte comparisons of the desktop package, desktop docs, handler/contract and SQL draft against the verified remote base were empty.
- The root worktree remains on `codex/squad-attendance-evidence-fix`; no root checkout, Squad or Medical product changes are made by this review.
- The verified remote branch will receive a normal fast-forward from the review worktree after mandatory checks. No force push or rewrite of the user's local branch is needed.
- Main integration target for this review: `ee2dff68cbb25116896a1662dde0c7588e2f496f`. Merge simulation found one conflict in the Presentation smoke fixture; other main changes are retained.

Task owner: this desktop/offline task. Adjacent contracts reviewed: Session Planner's canonical app-state, System/Security API guards and QA fixtures. Ownership of their business rules and remote databases is not transferred.

## Findings reproduced and corrected

Priority below describes the consequence if the prototype were promoted, not an incident against live data. Eight Rust regression tests and two JavaScript/Postgres tests failed against the prior behavior before corrections.

| Finding | Evidence before correction | Correction and guard |
| --- | --- | --- |
| P1: bundled fallback inherited active capabilities | The effective `main` permission union contained nine grants rather than two. Inspecting `bundled.json` alone missed the union. | Default build selects only bundled capability; hosted selects active/candidate/recovery. Native domain handlers independently require the active origin. The real bundled probe now also attempts and must be denied active SessionAuthority. |
| P1: late token refresh could resurrect credentials after logout/revoke or overwrite a replacement session | Deterministic provider-response interleavings recreated a deleted vault entry; same-actor replacement accepted the old response. | Native session generation binds refresh to its starting session. Generation validation and vault commit share the identity lock with account replacement/invalidation; network waiting does not hold that lock. Temporary serialized secrets also zeroize on vault-write failure. |
| P1: quarantined release retry bypassed anti-rollback policy | A known quarantined sequence 9 became a candidate after sequence 10 was observed. | Retrying a known generation rechecks current sequence/recovery policy before registry mutation. Active LKG use is unchanged. |
| P2: release counter could overflow its SQLite representation | Manifest accepted a sequence above `i64::MAX`. | Reject sequences that cannot be represented by the persistent counter. |
| P1: download size limit was enforced only after buffering | A 1,024-byte limit consumed 65,536 bytes from a lengthless reader. | Consume at most limit + one byte and reject overflow. Exact-limit and shorter bodies remain accepted. Signature/hash checks are unchanged. |
| P1: acknowledged operation ID could be reused | After receipt persistence and reopen, the same operation ID with a new revision mutated the projection again. | Check durable receipts within the same transaction before any projection mutation. Acknowledged IDs fail closed; the current receipt format does not claim content-bound repeat success. |
| P1: older native binary silently downgraded local schema metadata | Opening a database marked version 4 reset its version to 3. | Read and reject unsupported versions before schema setup or seeding. The database version remains unchanged. |
| P2: frontend block-duration payload did not deserialize in native code | Actual camelCase `blockId`/`durationMinutes` JSON failed with `unknown field blockId`. JavaScript mock and Rust struct tests did not cross this boundary. | Apply camelCase to enum fields. A JSON-to-Rust-to-SQLite test proves the duration changes and revision advances once. |
| P1: private SQL replay returned data without checking current membership | A soft-deleted membership could replay a previous accepted operation and retrieve its acknowledgement/result. | Revalidate membership before receipt lookup; reject NULL contract arguments explicitly. Test only the existing draft in disposable PGlite. No migration file or remote database changed. |

The download reader was first extracted without changing its read-all behavior so the resource-bound test could fail on the original algorithm. No performance budgets, datasets, mandatory checks or assertions were weakened.

## Boundaries checked

- Detached Ed25519 verification precedes manifest parsing; pinned release/recovery key roles, asset hashes, compatibility and immutable build identity remain enforced.
- Custom protocol assets remain allowlisted with restrictive CSP, no external navigation, downloads or new windows. Candidate and recovery commands are scoped separately.
- Projection mutation/outbox insertion and receipt/outbox removal remain transactional. The new receipt guard prevents ID recycling after acknowledgement.
- API actor/organization/team derive from server authentication. Default database adapters still return unavailable; there is no configured remote synchronization path.
- Supabase draft routines remain private with explicit grants to the dedicated executor. Existing web app-state remains canonical.
- Existing web/PWA workers and product runtime are not changed by the hardening commit.

## Verification and evidence interpretation

- Local Rust regression run before fixes: 8 failed, 0 passed. These are new adversarial cases, not an unexplained failure of the earlier baseline.
- Before-fix Postgres revoked replay and effective bundled permission tests both failed with missing rejection / excessive grants. The initial revoked fixture used an unsupported membership status; it was corrected to actual soft deletion before establishing the failure.
- After-fix local desktop suite: 40 passing tests; Rust: 36 passing and one explicitly ignored real OS credential test. Formatting and Clippy are required before push.
- Main refresh requires complete normal `npm run qa` plus desktop/Rust checks before push. The owning PR records the resulting exact SHA and new Windows run, avoiding an assertion that the September 1 run verifies changed code.
- Windows must exercise release compilation, actual WebView2 startup and capability denial on the new commit. Native process restart is not OS reboot.
- The JavaScript SQLite/PGlite integration harness is a synthetic contract implementation, not a compiled-Rust-to-real-backend test. Native Rust behavior and real wire deserialization have separate coverage. No live sync claim follows from the combined test count.

## Remaining conditions for the next implementation phase

Candidate A remains the recommended local-development architecture; Candidate B remains a rebuildable fallback. This review does not make the prototype production-ready.

Before a real-data pilot:

1. Use the existing migration ledger, revalidate remote drift with the owning database team when authorized, and replay the accepted full foundation in a disposable environment. The 60/49/48 audit is dated 2026-08-31; it is not a fresh remote count or clean-replay proof.
2. Replace synthetic identity/lease renewal with verified provider integration. Decide revocation/offline-lease behavior, credential-deletion failure recovery and durable session restoration before real credentials are used.
3. Replace generic snapshot `content`/block `payload` with an explicit allowed-data contract before the unavailable backend adapter is connected. The current prototype is not proof that arbitrary real snapshots exclude sensitive data.
4. Prove actual Rust transport/outbox convergence, conflict/rebase behavior, rejected mutation UI recovery, and foundation trigger/audit interaction. The current transport is test-only.
5. Establish local encryption/purge/device-loss policy and retention. Existing plaintext synthetic SQLite is not approved for private user data.
6. Reduce update-source lock contention before interactive real-data use: current network fetch holds shell/database locks during its bounded timeout.
7. Keep physical Windows Credential Manager, network changes, sleep/wake, OS reboot, installer/update UX, signing and SmartScreen as separate production-readiness checks.

Existing large Rust files remain prototype debt; new authority regression cases are separated into `authority_race_tests.rs`. Extract focused storage/authority tests and modules before expanding real integration, without changing existing behavior merely to meet a line count.

## Reference checks

- [Tauri capabilities](https://v2.tauri.app/security/capabilities/) explicitly describes union of permissions when a window participates in multiple capabilities. This informed the effective-build test and configuration fix.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions) documents function security context, search paths and execution grants. The existing private executor design is retained.
- [Supabase changelog](https://supabase.com/changelog) was checked for relevant current changes; this phase adds no provider API, extension or remote management operation.

No staging/production deployment, `main` merge/push, published installer, signing configuration, production credential use or remote database mutation is authorized by this report.
