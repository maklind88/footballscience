# Save verification: WebKit, 2026-09-24

## Scope and baseline

- Baseline: `d70dfa8448b8db0d2a5da5071deb3da076702586`, the PR #235 merge.
- Local branch: `codex/save-webkit-verification-20260924`.
- Initial verification made no product changes. The follow-up below fixes dialog focus only; no deployment, database mutation, or activation of additional offline modules.
- The restart test now launches the selected browser instead of always launching Chromium. Assertions are unchanged.
- A separate optional WebKit configuration selects only the relevant save suites; the normal QA configuration is unchanged.

## Terminal results

- Post-merge GitHub QA: success, including static/security, API contracts and all four browser shards.
  https://github.com/maklind88/footballscience/actions/runs/36032191675
- Corrected WebKit-only run: **39 passed, 2 failed**, no skips or retries.
- Initial mixed-project discovery run also passed 16 Chromium cases. This is not a full Chromium verification of all 41 cases.
- Syntax checks for both changed QA files and `git diff --check`: passed.

Reproduce the WebKit run:

```sh
npx playwright test --config=qa/playwright.save-webkit.config.mjs --project=save-webkit
```

Passing coverage includes IndexedDB version compatibility, blocked upgrades, cross-tab connections, preservation of newer pending changes, offline changes surviving a completely closed persistent browser profile, replay after reconnect, principal isolation, and concurrent edits/conflicts.

## Initial finding: dialog focus restoration

Both failures are the same keyboard-accessibility defect, at 1470px and 390px. In `qa/session-save-storage.smoke.spec.mjs`, the assertion that the opening button regains focus after Escape fails. Earlier data-preservation assertions pass.

`src/modules/session-planner/session-save-review.mjs` captures `document.activeElement` as the previous focus and focuses that element after closing. An isolated browser probe confirmed that clicking an unfocused button leaves `activeElement` as BODY in WebKit, whereas Chromium reports BUTTON. Consequently the dialog does not reliably remember its actual opener in WebKit.

Recommended next change: explicitly preserve the actual invoking control, retaining a safe fallback for other opening paths, then rerun the focused tests and the complete WebKit save matrix. Do not weaken the focus assertion or change save semantics to solve this finding.

## Follow-up: focus fix verified locally

The delegated workspace click handler now passes its actual opening control to `openLocalSaveReview`. That reference survives the lazy import and reaches `openSessionSaveReview`. Programmatic callers retain the active-element fallback, captured before awaiting the import. Closing restores focus only to a connected element in the same document.

No saving, conflict resolution, archival, permissions, or persistence behavior was changed. Product edits are restricted to the dialog and its two existing callers.

- Full WebKit save matrix: **43/43 passed**, no skips or retries, including the original two failures and new keyboard-fallback/removed-opener cases.
- Chromium save/restart/dialog regressions: **10/10 passed**.
- Runtime service/state contracts: **21/21 passed**, including the opener wiring contract.
- `npm run check`, explicit syntax checks and `git diff --check`: passed.

Chromium and contract command:

```sh
npx playwright test --config=qa/playwright.config.mjs qa/session-save-storage.smoke.spec.mjs qa/save-offline-recovery.smoke.spec.mjs qa/session-planner-runtime-service-contract.api.spec.mjs qa/session-planner-runtime-state-service-contract.api.spec.mjs
```

The initial focus fix was tested on the baseline above. The candidate was subsequently rebased without conflicts onto fetched `origin/main` at `1653a977b6d0b639758a3b51677d9ad0eaa22cb8`, incorporating the three later Squad commits without changing their files. The full 43-case WebKit matrix, 31-case Chromium/runtime-contract selection, `npm run check`, and diff check all passed again on the rebased code. Candidate CI/review and real-device Safari verification remain outstanding before publishing.

## Limits

- These are local browser tests with real IndexedDB and a synthetic revision-checked HTTP backend, not a production two-account verification.
- Playwright WebKit is useful Safari-engine coverage, not certification of physical iPad Safari, installed desktop apps, or offline application startup.
- The generic offline journal remains unactivated for additional modules.
- Green GitHub QA covers the merged baseline; it does not include the local focus fix or new tests.
- The local WebKit matrix is now green; whole-platform offline support and release readiness are not certified by this run.
