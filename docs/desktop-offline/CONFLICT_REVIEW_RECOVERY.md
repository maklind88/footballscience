# Desktop conflict review and safe local recovery

Date: 2026-09-23. Owner: this desktop/offline task. Baseline: `cdb0e7f97a827bc6b4656e6892ab1ed87fd9cc96` on `codex/fs-desktop-offline-phase3-current-main`.

## Decision and scope

The native queue already preserved conflicts, but offered no actionable review. The smallest safe next step is explicit **whole-queue reapplication**, not silent last-write-wins, arbitrary merge or deletion. Existing queued requests contain base revisions and intended values, **not original before-values**; the UI must not pretend to offer a three-way merge.

This phase owns only the desktop experiment and its synthetic test fixtures. Canonical Session Planner data ownership, normal web app-state, authentication policy, deployed API implementation, Supabase migration history and all other modules remain unchanged. No new SQL migration or remote database operation is required. The existing private SQL draft is only read by disposable PGlite tests.

## Implemented flow

1. A dedicated dialog in the signed full-web desktop bundle shows current local/server title and block values, server/local revisions and **every queued operation in revision order**.
2. Native fetches the selected session from its fixed, authenticated GET endpoint. The frontend supplies neither URL, snapshot, SQL, access token nor replacement operation payload.
3. A content fingerprint binds the review to the native context, local projection, immutable queue, conflict revision and complete supported server snapshot. It is an optimistic concurrency token, not a cryptographic signature or proof of a human gesture.
4. A checkbox explicitly confirms reapplication of all displayed operations. Refreshing or reopening the dialog clears confirmation. Cancel does not write data. Buttons/Escape cannot pretend to cancel an already-running native transaction.
5. Native fetches the server snapshot **again**, revalidates current authority/lease/credential/shell and compares the fingerprint. Changed local work or server values require another review. A server change after this GET is still protected by the existing server base-revision check during later upload.
6. One SQLite `BEGIN IMMEDIATE` transaction rechecks the local state; archives the original projection, typed requests and reviewed server snapshot; retires original operation IDs; installs supported server values; and queues the original intents under **new IDs and new sequential base revisions**. Original-to-new mappings and the recovery receipt are committed in the same transaction.
7. No upload occurs as part of recovery. A separate explicit sync call uses the existing immutable/idempotent transport. A lost local IPC acknowledgement can be replayed with the same review token: the native layer returns the same durable receipt, bound to the same context, without another rebase or HTTP request.

The current choices are **leave conflict unchanged** or **reapply all reviewed edits locally**. There is no discard, per-field merge, checkpoint deletion or generic export/import action. Original intent remains in the checkpoint and in the newly queued operations. Checkpoints do not have a general end-user restore/history browser in this phase.

## Boundaries and fail-closed behavior

- Native command `desktop_session_conflict` belongs only to the active signed window. Candidate validation, bundled fallback and read-only shell recovery gain no permission. Candidate B still has exactly two commands.
- Both `FS_DESKTOP_TEST_BUILD=1` and `FS_DESKTOP_SESSION_SYNC_EXPERIMENT=1` are required, plus the existing fixed `http://127.0.0.1` API origin. The UI requires the native experimental capability. Standard build helpers **do not enable this experiment**.
- Identity, organization, tenant, team, partition, epoch, lease, exact credential and active shell are checked. Credential rotation/logout during the request cannot return a review or commit recovery. The UI clears its review on access/context loss and ignores late responses after cancellation.
- Quarantined operations, uncertain previously-attempted successors, integrity mismatches, non-contiguous revisions, unsupported versions and more than 200 operations fail closed.
- The snapshot response is limited to 256 KiB. Its schema, session identity, revision, synthetic content marker, unchanged date and exact selected block identities/order are validated. Only title and duration payloads are supported. Added/deleted/reordered blocks, unknown payload/content fields and incompatible snapshots require separate work; they are never silently dropped.
- Review requires connectivity and current authorization. Offline/corrupt/malformed/401/403/429/5xx failures preserve the local conflict and queue. Snapshot errors do not automatically release quarantine or rebind another login's work.
- Retired original IDs cannot be reused through ordinary local mutations. Existing server acknowledgement IDs remain distinct from local recovery receipts.
- SQLite schema remains version 3. Bounded recovery records use namespaced entries in the existing `local_meta`; no SQL schema change is introduced. The small extraction `apply_in_transaction` lets recovery reuse the existing operation validator/mutator inside a single outer transaction.

## Tests and evidence

Native tests exercise real file-backed SQLite and loopback HTTP for read-only review, database reopen, exact original preservation, new IDs/revision ordering, duration reapplication, retention of unrelated server values, changed server/local state, incompatible snapshots, duplicate blocks, invalid scope/queue, quarantine, worker serialization, credential rotation, logout and server error responses. A SQLite trigger abort proves archive/queue/projection/receipt rollback together. Repeated confirmation returns the original receipt without resending.

The existing native HTTP integration is strengthened: dropped accepted acknowledgement → database reopen → immutable replay → conflict → database reopen with preserved blocking → actual GET snapshot handler/private SQL routine → revalidation GET → local rebase → separate upload → server revision 10 with exactly two applied operations. Provider authentication and outer guard remain synthetic test dependencies; parser, handler, native transport and SQL routine are real. This is not production Supabase/RLS verification.

JavaScript contracts cover confirmation, cancellation, stale replies, access loss, failure without automatic retries, typed bounded IPC, partition rejection, browser fallback and capability/build gates. A separate local browser harness exercises the actual panel/controller/typed bridge with **synthetic native responses**; it is UI evidence, not native persistence evidence.

Local checks completed so far:

- Desktop JavaScript suite: **62 passed, zero failed/skipped**.
- Full native Rust suite: **72 passed, zero failed, one ignored** real OS credential-store roundtrip (unchanged physical-device gate).
- New recovery subset: **10 tests × 5 fixed runs = 50 passed**, no retry-on-failure harness. Durations: 0.96 / 0.74 / 0.43 / 0.39 / 0.43 seconds.
- Strict Clippy (`--all-targets --locked -- -D warnings`), Rust formatting and diff whitespace validation passed.
- Browser UI: actual dialog opened, values/operation order read, confirmation disabled initially, explicit checkbox enabled it, refresh reset confirmation, recovery displayed an explicitly local/not-uploaded receipt, cancellation returned focus. This used the opt-in synthetic `tools/conflict-ui-preview.mjs` harness, not a packaged native window.

- Final `npm run qa:static`: passed, including syntax/security/storage/migration/performance/architecture guards. The existing 83 cross-module file-size warnings are unchanged.
- Candidate A macOS release compilation: passed (`npm run tauri:build:hosted`, 1m39s optimized compilation). No installer or package was published, and this is not packaged-dialog interaction evidence.

### Mandatory QA blocker — no push / no Windows dispatch

Full `npm run qa` finished with exit 1: **3,158 passed, three skipped, one failed**, Playwright duration **19.9 minutes**. The unchanged private-workbook/private-video fixture skips are not verified results.

Failure: `qa/scouting-workspace.smoke.spec.mjs:596`, “Scouting mobile database, Lists action, and profile remain unobstructed”. At line 632, the `Performance` profile tab still had `aria-selected="false"` after focusing the selected tab and pressing ArrowRight; the assertion timed out after 10 seconds. The screenshot still shows Overview selected. This is **not** the earlier database-search performance blocker: that gate passed at **316 ms / 1,000 ms**, unchanged.

Read-only triage confirms the failed test, Scouting implementation and all normal web/API/Supabase source files are unchanged from baseline `cdb0e7f`. The newly added dialog is injected only into the generated desktop bundle, not normal web `index.html`. This narrows the affected surface but **does not establish the failure's root cause or prove baseline reproducibility**. No retries, test weakening, Scouting implementation changes or timing-budget changes were used to force green.

The desktop implementation is locally verified as listed above, but **the branch is not cleared for push or Windows CI**. This keyboard-navigation issue falls outside the previously authorized, specifically bounded Scouting database-search performance correction. It needs Scouting-owner diagnosis or explicit additional bounded ownership before proceeding. No Windows workflow was dispatched for this phase. The previous Windows run `35939954165` verifies the preceding checkpoint only, not this new code.

Local evidence:

- Full QA: `/private/tmp/fs-conflict-recovery-qa-20260923.log`
- Failure screenshot/context/trace: `test-results/scouting-workspace.smoke-S-1b272-profile-remain-unobstructed-chromium/`
- Desktop contracts: `/private/tmp/fs-conflict-recovery-node-20260923.log`
- Static checks: `/private/tmp/fs-conflict-recovery-static-20260923.log`
- Five recovery repetitions: `/private/tmp/fs-conflict-recovery-repeat-20260923.log`
- macOS build: `/private/tmp/fs-conflict-recovery-macos-build-20260923.log`

Next operational step is to resolve this scoped QA blocker, rerun the complete mandatory suite under its normal rules, and only then push the isolated branch and dispatch Windows CI. None of this authorizes deployment or real-data activation.

## Explicit limitations and next gates

- Not a whole-app offline implementation; still the selected synthetic Session Planner slice.
- No real datasets, real-provider activation, remote writes, deployment, main merge, signing, installer publication or native update.
- No automated reconnect scheduler, general structural conflict resolver, per-field decision or automatic merge.
- Local checkpoints are not encrypted and are not independent/cloud backups. Retention/purge, device loss and encryption must be decided before importing real personal data. This phase never purges checkpoints.
- The new dialog/native command is not claimed verified in a packaged macOS/Windows window merely because the Rust worker and browser UI pass separately. Standard Windows builds keep the experiment disabled.
- Physical Windows network switching, reboot, sleep/wake, Credential Manager, installer/update UX and SmartScreen remain separate production-readiness gates.

Next recommended local step: a dedicated, opt-in packaged-desktop acceptance harness that connects the actual dialog/IPC to a synthetic authenticated server and file-backed queue, followed by reviewed non-production dataset selection. Keep real-data activation blocked until privacy/device-storage and backend policy gates are settled.

Supabase skill security review used the official [session lifecycle/revocation documentation](https://supabase.com/docs/guides/auth/sessions) and current changelog. No provider API or session policy changed. Browser skill was used for actual UI interaction and verification, with the synthetic boundary preserved.
