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

### Initial mandatory QA blocker — historical, subsequently corrected

Full `npm run qa` finished with exit 1: **3,158 passed, three skipped, one failed**, Playwright duration **19.9 minutes**. The unchanged private-workbook/private-video fixture skips are not verified results.

Failure: `qa/scouting-workspace.smoke.spec.mjs:596`, “Scouting mobile database, Lists action, and profile remain unobstructed”. At line 632, the `Performance` profile tab still had `aria-selected="false"` after focusing the selected tab and pressing ArrowRight; the assertion timed out after 10 seconds. The screenshot still shows Overview selected. This is **not** the earlier database-search performance blocker: that gate passed at **316 ms / 1,000 ms**, unchanged.

Read-only triage confirms the failed test, Scouting implementation and all normal web/API/Supabase source files are unchanged from baseline `cdb0e7f`. The newly added dialog is injected only into the generated desktop bundle, not normal web `index.html`. This narrows the affected surface but **does not establish the failure's root cause or prove baseline reproducibility**. No retries, test weakening, Scouting implementation changes or timing-budget changes were used to force green.

At that checkpoint **the branch was not cleared for push or Windows CI**. This keyboard-navigation issue fell outside the previously authorized, specifically bounded Scouting database-search performance correction. Work paused until the user explicitly approved bounded ownership of this additional QA prerequisite. The previous Windows run `35939954165` verifies the preceding checkpoint only, not this new code.

Local evidence:

- Full QA: `/private/tmp/fs-conflict-recovery-qa-20260923.log`
- Initial failure screenshot/context/trace were inspected in `test-results/scouting-workspace.smoke-S-1b272-profile-remain-unobstructed-chromium/`; normal subsequent full QA replaces that output directory. The diagnostic baseline/current failure traces are retained separately as documented in the prerequisite report.
- Desktop contracts: `/private/tmp/fs-conflict-recovery-node-20260923.log`
- Static checks: `/private/tmp/fs-conflict-recovery-static-20260923.log`
- Five recovery repetitions: `/private/tmp/fs-conflict-recovery-repeat-20260923.log`
- macOS build: `/private/tmp/fs-conflict-recovery-macos-build-20260923.log`

### Approved prerequisite resolution and current verification

The user approved the bounded keyboard prerequisite. [Scouting diagnosis and fixed-run evidence](../SCOUTING_PROFILE_KEYBOARD_QA.md) records the baseline comparison, deterministic redraw/focus failure, minimal eight-line implementation correction and unchanged original QA gate. Scouting remains a separate commit (`f2e08cc3f2252786e2cfd0dcc4276b65f4418cfe`) from desktop implementation (`3eac3281a29b09e224db86f719dd481541b9d3a2`).

- Focused keyboard tests: ten passed after correction; the deterministic redraw test previously failed three times each on the baseline and desktop source.
- Complete mandatory `npm run qa`: **3,160 passed, zero failures, three existing private-fixture skips**, 13.6 minutes, exit 0. Both keyboard tests passed in the full run; database search passed at 250 ms against its unchanged 1,000 ms guard.
- Desktop contracts re-run: 62 passed. Rust re-run: 72 passed, one unchanged ignored real OS-vault test; format and strict Clippy passed.
- Candidate A optimized macOS build re-run with corrected web source: passed, 25.60 s compilation. Still no claim of packaged conflict-dialog acceptance.
- Clean branch `codex/fs-desktop-offline-phase3-current-main` pushed at `f2e08cc3` only after the required checks passed.
- [Windows CI run 35947051993](https://github.com/maklind88/footballscience/actions/runs/35947051993), **FS Desktop Windows Architecture Verification**, tested exact SHA `f2e08cc3f2252786e2cfd0dcc4276b65f4418cfe`: **failed**, not an accepted full Windows checkpoint. All six web QA jobs, 62 desktop contracts, 72 native tests (one existing ignored OS-vault test), strict Clippy/format and all three Windows release compilations passed. Runtime verification passed seven checks before the hanging-candidate staging probe timed out at its unchanged 30-second limit. Subsequent quarantine/backoff, offline transitions and unauthorized-origin probe were not completed in this run.

[Sanitized Windows failure evidence](CONFLICT_RECOVERY_WINDOWS_2026-09-23.json) records the environment, artifact identities and exact limitations. Artifact `fs-desktop-windows-architecture-35947051993` contains three unsigned executable builds, build/runtime manifests and logs; all executable SHA-256/size pairs were verified after download. The CI artifact-name guard was skipped because the preceding runtime step failed; an equivalent local filename check found no forbidden key/secret filenames. Neither result is a claim of production-secret use or a complete binary secret scan.

The trace ends after `desktop_prepare_shell_update` starts; it does not establish whether lock contention, HTTP, durable extraction or another cause consumed the deadline. The previous successful Windows trace (`35939954165`) measured this preparation at 24,370 ms, compared with 11,827 ms for initial preparation. The failed run's initial preparation took 10,340 ms. These limited observations motivate investigation, not a conclusion of environmental noise or a justified budget increase.

No timeout increase, retry-until-green or weakening is justified by this evidence. A local diagnostic-only change adds CI-gated phase markers for lock acquisition, signature verification, asset download/write and bundle extraction/verification. It logs only fixed stage names and numeric counters, not credentials, user content or arbitrary paths. The Windows verifier retains the exact 30-second assertion deadline. On failure only, it observes native tracing for another 30 seconds and then rethrows the original error unconditionally; later progress cannot turn that failed assertion green. Functional contracts and pass/fail budgets are unchanged.

With this instrumentation, the actual packaged macOS verifier passed all ten checks, including candidate quarantine/backoff, offline cold start, process restart and reconnect. Hanging-candidate preparation completed in about 4.4 seconds there. This is useful macOS comparison evidence, **not** Windows resolution or packaged conflict-dialog acceptance. A further Windows diagnostic run requires the normal local QA gate; the original failed run remains part of the evidence.

Diagnostic checkpoint local validation: **63 desktop contracts passed** (including a new guard against retry/late-pass behavior), **72 Rust tests passed, one unchanged OS-vault test ignored**, strict Clippy/format/syntax/diff checks passed, and a second complete mandatory QA run returned **3,160 passed, zero failures, three unchanged private-fixture skips**, 13.9 minutes. Only one instrumented Windows verification is to be dispatched; the workflow itself is unchanged.

Candidate A remains the working recommendation and Candidate B passed rebuild/startup as a fallback. However, this Windows checkpoint remains blocked until the timeout is understood and the complete runtime suite passes. The prior provisional local architecture decision does not convert this failed verification into a pass. Physical Windows production-readiness gates remain open.

### Instrumented Windows result — green run, original cause still unproven

[Run 35949935172](https://github.com/maklind88/footballscience/actions/runs/35949935172) tested `0e1f06936760a7506a8e5fdeb2550cfd9cec02e9` and passed **all seven jobs**, including **63 desktop contracts**, **72 Rust tests / one unchanged ignored OS-vault test**, strict checks, all three Windows release builds, and **all 13 actual runtime probes**. The original 30-second staging assertion passed; the post-failure observation branch was not used. No retry loop or budget increase was introduced. The workflow file is unchanged.

This verifies Candidate A/B startup, signed activation, native generation/SQLite process-restart persistence, signature/key/tamper/compatibility rejection, candidate timeout/quarantine/backoff, restart backoff retention, synthetic online→offline→restart→online, unauthorized native command and unauthorized-origin rejection on this runner. Desktop executable caching is native app-data, not a desktop modification to the normal browser/PWA service worker.

[Sanitized diagnostic evidence](CONFLICT_RECOVERY_WINDOWS_DIAGNOSTIC_2026-09-23.json) includes the executable hashes, artifact identity and per-phase timings. Artifact `fs-desktop-windows-architecture-35949935172` (ID `10789020741`, 20,007,952 bytes, expires 2026-10-08) contains the three unsigned executables, build manifest, runtime environment/results and logs. All downloaded executable size/SHA-256 pairs match the manifest; the CI artifact-name guard passed. No installer/release was generated or published.

The runner was Windows Server 2025 Datacenter / AMD64 / build 10.0.26100, image `win25-vs2026`, with **WebView2 153.0.4234.48**. The failed run used **152.0.4191.66**. Both used the same generated frontend build identity `hosted-test-normal-s21-ba8a1d837063`, but the runner/runtime environment and native diagnostic code differ. This is not a controlled causal before/after comparison.

Native phase trace measurements (not whole-app startup timings):

| Phase | Initial candidate | Hanging candidate |
| --- | --- | --- |
| Preparation, lock wait through staged result | 13,734 ms | 7,969 ms |
| Shell/database lock acquisition | 0 ms at trace resolution | 2 ms |
| Extraction/durable individual-file writes | 12,440 ms | 7,156 ms |

The green run identifies file work as the dominant preparation cost in **that run**. It cannot prove the uninstrumented failure was caused by disk load, WebView2, lock contention or another event. No functional Windows fix is claimed. The first failure is not reclassified as flaky or erased merely because the instrumented run passed.

**Disposition:** Scouting's keyboard prerequisite is corrected and its mandatory baseline is green. Current-commit Windows functionality is verified as listed, but the broader desktop **stability hold remains open for the unexplained earlier staging timeout**. Candidate A remains preferred and Candidate B remains viable fallback evidence; do not reopen real-data activation, deployment or distribution on the strength of this single passing diagnostic run. The existing local-development architecture decision remains provisional, not a production or final phase sign-off.

Next recommended bounded phase: establish a controlled Windows candidate-preparation reproduction and separate preparation cost, runtime/version effects and native-watchdog behavior without weakening either guarantee. Then resume packaged conflict-dialog/native-IPC/file-backed-queue acceptance. A proposed three-run workflow loop was rejected by the permission safety review and was not applied; no further automatic reruns were performed.

### Remaining physical/manual Windows checklist

- Installer install/uninstall/upgrade UX and preservation of pending local work.
- Sleep/wake while editing, offline and during sync.
- Real Wi-Fi/Ethernet/airplane-mode/VPN/proxy transitions and lease expiry.
- Real Windows Credential Manager roundtrip, logout and account-switch isolation.
- Update installation/interruption/rollback UX with preserved local data, after separate signing/release authorization.
- SmartScreen behavior of the eventual authorized distribution; CI executables do not establish it.
- Physical OS restart/power interruption and recovery of projection, immutable outbox and receipts.
- Actual packaged conflict dialog through native IPC and synthetic backend, with explicit confirmation, cancellation, changed-server rejection and restart after recovery. This is not proved merely by separate native tests and browser UI tests.

No staging/production deploy, `main` integration, remote Supabase operation, migration/history repair, production-secret use, production signing or installer publication occurred in this task.

Local full-suite log: `/private/tmp/fs-keyboard-prerequisite-full-qa.log`. No staging/production deployment, main integration or real-data activation is authorized by this resolution.

## Explicit limitations and next gates

- Not a whole-app offline implementation; still the selected synthetic Session Planner slice.
- No real datasets, real-provider activation, remote writes, deployment, main merge, signing, installer publication or native update.
- No automated reconnect scheduler, general structural conflict resolver, per-field decision or automatic merge.
- Local checkpoints are not encrypted and are not independent/cloud backups. Retention/purge, device loss and encryption must be decided before importing real personal data. This phase never purges checkpoints.
- The new dialog/native command is not claimed verified in a packaged macOS/Windows window merely because the Rust worker and browser UI pass separately. Standard Windows builds keep the experiment disabled.
- Physical Windows network switching, reboot, sleep/wake, Credential Manager, installer/update UX and SmartScreen remain separate production-readiness gates.

Next recommended local step: a dedicated, opt-in packaged-desktop acceptance harness that connects the actual dialog/IPC to a synthetic authenticated server and file-backed queue, followed by reviewed non-production dataset selection. Keep real-data activation blocked until privacy/device-storage and backend policy gates are settled.

Supabase skill security review used the official [session lifecycle/revocation documentation](https://supabase.com/docs/guides/auth/sessions) and current changelog. No provider API or session policy changed. Browser skill was used for actual UI interaction and verification, with the synthetic boundary preserved.
