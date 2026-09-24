# Native outbox transport — local experiment

Date: 2026-09-23 (America/New_York)

## Scope and disposition

This phase connects the existing file-backed Rust/SQLite Session Planner outbox to the existing authenticated HTTP contract. It remains a **synthetic, local-only experiment**, not a production synchronization release or a claim that all Football Science features work offline.

Owner: this desktop/offline task. Existing Session Planner source-data ownership, canonical web app-state, server permissions and Supabase schemas are unchanged. The Scouting module is not changed. The isolated worktree is `/private/tmp/footballscience-desktop-phase3`, branch `codex/fs-desktop-offline-phase3-current-main`; unrelated changes in the user's primary workspace are untouched.

## Implemented

- `sync_queue.rs` selects immutable selected-session operations in **base-revision order**. Equal timestamps and reverse-ordered UUIDs cannot reorder dependent operations. A quarantined/conflicted predecessor is not skipped.
- Stored payload bytes are checked against their original SHA-256 and duplicated queue columns before sending. This detects inconsistency; it is not encryption or protection against a local attacker able to rewrite both payload and hash.
- Only `session.rename` and `block.duration.set` are encoded. Actor, tenant, organization and team authorization are not accepted from a frontend-supplied upload body; the server derives scope from its authenticated actor.
- `sync_worker.rs` performs one operation per explicit call, with one worker per native runtime. No polling loop, silent retry, background scheduler or automatic conflict overwrite is introduced.
- The native HTTP client uses its fixed origin and `/api/desktop-session-sync`, bearer credentials from native memory, no redirect following, existing 8-second connect/30-second total timeout, and 32 KiB request/response bounds for this endpoint.
- Authority, partition, actor, team, tenant, auth epoch, exact credential, lease and current shell are validated before sending and again before accepting a response. Network IO holds neither the SQLite mutex nor the authority mutex. A late response cannot clear work or revoke a newly activated account or same-epoch rotated credential.
- Attempts are durably recorded before transport. A `sending` row remains replayable after interruption with the same ID/body. A matching `accepted`/`already-applied` response is required; operation ID, schema/protocol, acknowledgement UUID and resulting revision are checked.
- Receipt insertion and queue removal are one SQLite transaction. The optimistic local projection is **not replaced by an older acknowledgement**; edits made during a request remain local and queued.
- A conflict preserves the queue and projection and stores only a bounded server-revision marker in the existing `local_meta` table. Conflict status survives database reopen and is accepted by the existing desktop presentation/controller. No local-schema version change is needed.
- 401/403 responses quarantine the affected operation; no pending work is deleted. 401 also invalidates the still-matching native session. Transport errors, malformed responses, 429 and 5xx preserve retryable work without automatic retry.
- The adjacent generic `desktop_api_request` broker now uses `auth_request.rs` to fence successful data and 401 responses to the originating actor/scope/epoch/credential too. Self-review found its previous unfenced response could cross an account switch or revoke a newly rotated credential. Synthetic HTTP race tests cover different-account login, logout and same-epoch refresh, for both 200 and 401. No real-provider access was enabled to implement or test this correction.
- `desktop_sync_selected_session(context)` is active-window-only, with no caller URL, token, SQL or raw outbox parameter. It requires **both** `FS_DESKTOP_TEST_BUILD=1` and `FS_DESKTOP_SESSION_SYNC_EXPERIMENT=1`, and an exact `http://127.0.0.1` API origin. Standard build helpers do not enable it. Candidate B, candidate validation and recovery do not gain this permission.
- The typed bridge exposes this bounded call, but no automatic UI sync trigger or real-provider activation is added. Real session tokens/data are not wired into the synthetic projection.

## Why these changes were needed

The previous native `sync_contract.rs` used an in-process synthetic server and selected by timestamp/operation UUID. The full local JavaScript integration independently modelled SQLite behavior. Those were useful architecture contracts but did not establish that the actual Rust transport could send the real API wire format, validate its response, or survive transport/SQLite failures. The new path is production-compiled native code, exercised without a production endpoint.

## Verification design

| Scenario | Evidence |
| --- | --- |
| Lost HTTP acknowledgement after real SQL commit | Rust starts a loopback Node server, invokes the existing API handler and existing private SQL draft in disposable PGlite; first response is dropped after commit; Rust reopens SQLite, replays, receives `already-applied`; server ledger remains one application |
| Subsequent concurrent server edit | Same end-to-end test advances the synthetic authoritative revision; next Rust operation returns conflict and preserves both server and local versions |
| Queue ordering | Same timestamp, deliberately reversed UUID order, two successive revisions |
| In-flight local edit | A second local operation is written while HTTP is pending; earlier receipt leaves the newer projection and queue item intact |
| Atomic receipt/delete failure | SQLite trigger aborts queue deletion after receipt insert; both roll back, reopen preserves the item, replay succeeds |
| Identity/shell changes during HTTP | Reauthentication, same-epoch token rotation, logout, lease expiry and active-shell rejection prevent late acknowledgement commit; late 401 does not revoke new authority/credentials |
| Bad responses | Wrong operation/revision/schema/protocol/ack UUID, unknown fields, malformed result, oversized/truncated body, HTML and redirect all preserve work |
| Authorization/availability | 401, 403, 429, 500, 503; quarantined predecessors, altered scope, expired lease and concurrent-worker rejection |
| Wire compatibility | Shared JSON fixture must match Rust serialization and pass the actual JavaScript server contract; block-duration HTTP path checked separately |
| UI/bridge boundary | Conflict survives controller refresh; browser fallback is inert; cross-partition result rejected; capability and build-gate contracts checked |

The local HTTP integration substitutes **only** provider authentication, outer request guard and response fault injection with synthetic test dependencies. It uses the existing parser/handler/request validator and actual draft SQL routine under `fs_desktop_sync_executor`, not a mock apply operation. It does not verify real Supabase Auth, production RLS configuration, rate limits, a deployed route or PostgreSQL service/process failures. PGlite's in-process test database is not a production Supabase project.

A server may already have applied an operation when logout happens during an in-flight request. Client-side revalidation prevents a stale local commit; it cannot undo an already submitted request. Server-side authorization/revocation remains mandatory. Same-account token refresh preserves the epoch; explicit reauthentication/account switching requires a future reviewed pending-work rebind/recovery policy and currently fails closed.

## Final verification record

- Desktop Node contracts: **57 passed**, zero failed/skipped, including the additional Windows fail-fast contract.
- Native Rust: **62 passed**, zero failed, one explicitly ignored real OS credential-store test (unchanged physical-device gate).
- Native sync/security subset: **18 tests × 5 runs = 90 passed**, no retry-on-failure harness. Each repetition included the actual Rust/HTTP/handler/PGlite recovery test.
- `cargo fmt --all -- --check`, `cargo clippy --all-targets --locked -- -D warnings`, and `git diff --check`: passed.

- Final Candidate A macOS release compilation: passed (`npm run tauri:build:hosted`, no installer/package/publication). This is compilation evidence, not a new packaged-window UI or physical-device run.

- Full mandatory `npm run qa`: **3,159 passed, three skipped, zero failed**, exit 0 (40.4 minutes for Playwright). The unchanged conditional skips require `SCOUTING_IMPORT_FIXTURE` (private workbook) or `FS_PLAYER_REVIEW_SOURCE` (two private-media viewport checks). The mandatory Scouting search performance gate remains enabled and unchanged.
- `npm run qa:static` was rerun after the Windows workflow correction and passed. Existing cross-module size warnings are unchanged; no broad refactor was included.

Windows CI evidence must refer to the exact new code commit; earlier run `35932204339` covers only the prior code checkpoint and is not evidence for this change. A new run and its outcome will be appended after dispatch and completion.

Two pre-existing `collapsible_if` style warnings in the desktop authority/bundle code were corrected without behavioral changes so strict Clippy (`-D warnings`) can pass. No lint, assertion, timing budget or required test was disabled.

The isolated Windows workflow now checks `$LASTEXITCODE` after each native command, rather than relying on the last command in a multi-command PowerShell step. Native format/test/Clippy output is retained in the existing evidence artifact, and CI Clippy also rejects warnings. This prevents a later passing command from concealing an earlier failing native gate.

## Still not implemented / not verified

- Real offline dataset selection/import and non-synthetic auth/API/provider execution.
- Automatic reconnect scheduling, backoff policy, full authoritative snapshot convergence and conflict review/rebase UX.
- Automatic deletion, discard, quarantine release or reauthentication rebinding of pending operations.
- Encryption at rest, approved retention/purge/device-loss policy and real secure-store device proof.
- Every module offline, arbitrary new sessions/blocks, medical data, video assets or whole-document replication.
- Physical Windows network changes, sleep/wake, OS reboot, Credential Manager, installer/update UX and SmartScreen.
- Packaged-window interaction with the new upload command: the core worker is verified separately; default binaries keep upload disabled.

## Next local phase

Build explicit conflict review and safe recovery/rebase around the preserved operation/revision contract, with no silent last-write-wins and no loss of the original pending intent. Keep the synthetic gate until non-production identity/data scope and backend activation are separately agreed. Decide the encryption/retention/device-loss policy before importing any real personal data. Continue adding feature-specific offline adapters after the first vertical slice is complete; loading the whole web bundle is not equivalent to offline feature coverage.

No deploy, main integration, installer publication, production/staging database operation, new migration, secret rotation or production signing was performed. The existing migration-reconciliation ledger is unchanged.

Candidate A remains recommended and Candidate B remains a rebuildable fallback. No delivery-model or backend-boundary ADR change is required by this phase. The architecture gate remains provisional for local development, not production readiness.

Auth security reference consulted: [Supabase session lifecycle and revocation](https://supabase.com/docs/guides/auth/sessions). No new Supabase SDK or provider feature is introduced by this phase.
