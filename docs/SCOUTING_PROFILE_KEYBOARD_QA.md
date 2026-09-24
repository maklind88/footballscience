# Scouting profile keyboard QA prerequisite

Date: 2026-09-23 (local). Owner: desktop/offline task, under explicit bounded user approval. No general Scouting feature work or release authorization.

## Evidence and diagnosis

The desktop conflict-review checkpoint `3eac3281a29b09e224db86f719dd481541b9d3a2` had a mandatory QA failure at `qa/scouting-workspace.smoke.spec.mjs:632`: ArrowRight did not select Performance. Full QA reported 3,158 passed, three existing private-fixture skips and one failure. The prior database-search performance gate passed at 316 ms against its unchanged 1,000 ms budget. This is a keyboard/focus prerequisite, not a search-performance change.

Baseline `cdb0e7f97a827bc6b4656e6892ab1ed87fd9cc96` and desktop checkpoint have identical Scouting implementation and original test. Five fixed repetitions of the original test passed on each. These passes do not invalidate the original full-suite failure or prove its exact event ordering.

A deterministic browser regression exposes a concrete existing implementation defect: `renderScoutingProfileModalIntoDom` replaces the backdrop, but `getScoutingFocusSnapshot` only captures inputs, textareas, selects and contenteditable fields. The 700 ms post-open render therefore removes a focused profile tab and leaves focus on the document body. The same loss occurs when keyboard selection itself redraws the modal, breaking consecutive navigation. The existing 40 ms focus guard protects an attached child, not a child removed by rendering.

The new test opens the real profile against the unchanged bundled database, freezes browser timers, focuses Overview, then advances the real timers by 750 ms. It verifies that deferred rendering completed and focus survived, followed by ArrowRight, Home, End and wraparound navigation without manually refocusing between keys. It replaces neither the renderer, dataset nor event handler. Before implementation changes it failed on focus retention in all three runs on each source version. The baseline worktree only received this additional test, not the implementation fix.

This establishes the redraw/focus defect and baseline reproducibility. The original historical trace did not record `document.activeElement` at key dispatch, so it is not evidence that the precise same asynchronous callback caused that one failure. Full normal QA remains required after the fix; no passing subset is a substitute.

## Smallest correction

Add eight lines to the existing focus snapshot function to identify a focused profile tab by its escaped `data-scouting-profile-tab` value. Existing restoration restores that specific tab after rendering. `fieldIndex: -1` prevents fallback to an unrelated form field if the tab no longer exists. Existing form-field/caret behavior and focus outside Scouting remain unchanged. No new timer, delayed assertion, retry, query, index, API, migration, persisted-data contract or permission change.

The original smoke test is unchanged. One additional browser regression strengthens the required normal QA gate. Its time control is for deterministic event ordering, not performance measurement. No budget, dataset, assertion or required gate is weakened.

## Fixed-run measurements on the same macOS machine

All runs used one Playwright worker and `--retries=0`. Each repetition starts a fresh browser context/worker; OS/file caches were not forcibly cleared. These are whole smoke-test durations, **not database-search timings or a controlled cold-versus-warm performance benchmark**. Initial versus subsequent runs are retained below rather than relabelled as JIT measurements. For these small samples, nearest-rank p95 equals the maximum. Expected failing runs include the unchanged 10-second focus assertion timeout.

| Source / test | Runs (seconds) | Result | Min | Median | p95 / max |
| --- | --- | --- | --- | --- | --- |
| Baseline, original | 5.5, 5.0, 21.4, 5.0, 12.3 | 5/5 pass | 5.0 | 5.5 | 21.4 |
| Desktop before, original | 5.6, 12.4, 12.6, 5.1, 5.0 | 5/5 pass | 5.0 | 5.6 | 12.6 |
| Baseline, controlled redraw | 22.8, 22.5, 22.8 | 3/3 fail: lost focus | 22.5 | 22.8 | 22.8 |
| Desktop before, controlled redraw | 22.3, 22.4, 22.2 | 3/3 fail: lost focus | 22.2 | 22.3 | 22.4 |
| Desktop after, original | 12.5, 12.4, 12.2, 12.1, 5.1 | 5/5 pass | 5.1 | 12.2 | 12.5 |
| Desktop after, redraw + consecutive keys | 12.8, 12.4, 12.9, 12.4, 13.6 | 5/5 pass | 12.4 | 12.8 | 13.6 |

Baseline controlled runs overlapped the first corrected-source runs; therefore durations must not be used to claim a speed improvement. Timer-controlled focus loss is independent of wall-clock scheduling. Ordinary smoke duration remains machine-load sensitive.

## Verification and handoff

- Focused after-fix suite: 10 passed, zero failures, fixed five repetitions per test.
- Desktop contracts: 62 passed, zero failures/skips.
- Native Rust: 72 passed, zero failures, one unchanged ignored real OS credential-store test.
- Rust format and strict Clippy passed; syntax and diff whitespace checks passed.
- Candidate A optimized macOS build passed (25.60 s compilation); no installer published.
- Complete mandatory QA and Windows CI: pending at this checkpoint. Push is prohibited until mandatory QA passes.

Local logs: `/private/tmp/fs-scouting-keyboard-{baseline-before,current-before,baseline-regression,regression-before,after}.log`, `/private/tmp/fs-keyboard-prerequisite-desktop-node.log`, `/private/tmp/fs-keyboard-prerequisite-macos-build.log`, `/private/tmp/fs-keyboard-prerequisite-full-qa.log`. The failing baseline and desktop regression runs retain screenshots and traces under the corresponding `/private/tmp/fs-scouting-keyboard-*` output directories.

The correction must remain a separate Scouting commit from desktop implementation `3eac3281`. Windows CI can verify the branch, not physical Windows installer UX, sleep/wake, network switching, Credential Manager, update UX, SmartScreen or operating-system restart. No staging/production deployment, main integration, remote database change or real-data activation is authorized.
