# Medical working-draft pilot evidence

Scope/owner/decision: SAVED_WORK_CONTRACT_2026-10-09.md.

## Before correction

The deterministic full-app test invokes the normal runtime reload after a failed
save. With localStorage quota, denied rescue IDB and app-state POST503, it fails
at the original assertion: expected `Synthetic full-app rescue`, received
`Central baseline`. The original assertion remains in the test after correction.
The test's previous requirement of no recovery UI when IDB failed is replaced by
stronger checks for explicitly volatile, inspectable, downloadable working content.
No saved-state assertion was relaxed.

The existing code in 56063c14 has the same read/reload boundary. The prior test
modified state through an accessor; the pilot also tests the real recommendation
form to distinguish a fixture-only mutation from normal clinical saving.

## Negative control through the actual form

The candidate's real-form test was also run with the original HEAD state-service
restored temporarily. It failed at the working-content assertion after ordinary
runtime reload: the submitted marker was absent (expected true, received false).
The candidate file was restored byte-for-byte in a finally block. The corrected
form flow passes and additionally proves that a newer central recommendation is
shown while the original working variant remains reviewable and downloadable.

## Validation status

- 413 Medical and shared runtime API/contract tests passed.
- 52 Medical browser checks passed in WebKit, including the real form.
- Repository `npm run qa:static` passed, including syntax, storage/platform,
  migration, performance and architecture guards. Its 84 existing large-module
  warnings remain; this is not an architecture-debt cleanup.
- 140 Chromium browser checks passed: central revision/reconciliation, save-issue
  isolation, Medical recovery/verification/visibility and the new working-version
  cases. No failing checks or skips in these targeted runs.

Fixtures cover exact owner/baseline/revision matching, absence/deletion, late
commits, a newer ordinary save, changed access, two tabs, retry retaining the
original baseline, transaction failure, storage capacity, export and reload.
The two-tab fixture uses one synthetic principal; it is not proof of distinct
real authenticated users working together in production.

No production certification is claimed here. Distinct-user deployed acceptance,
pre-submit form drafts and the remaining per-module matrix are still outstanding.

## Reproduction and verification commands

Run from the isolated candidate checkout:

```sh
npm run qa:static
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/medical-*.api.spec.mjs qa/central-sync-runtime-service-contract.api.spec.mjs qa/data-safety-runtime-service-contract.api.spec.mjs
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/central-state-revision.smoke.spec.mjs qa/medical-working-drafts.smoke.spec.mjs qa/medical-draft-recovery.smoke.spec.mjs qa/medical-draft-verification.smoke.spec.mjs qa/medical-saved-visibility.smoke.spec.mjs qa/local-save-issues.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/medical-working-drafts.smoke.spec.mjs qa/medical-draft-recovery.smoke.spec.mjs qa/medical-draft-verification.smoke.spec.mjs qa/medical-saved-visibility.smoke.spec.mjs
```

The regression is the `rescue unavailable: real-form` case in
`qa/medical-draft-recovery.smoke.spec.mjs`. For the negative control, use the same
test with the `medical-runtime-state-service.mjs` implementation from d16ff9ea in
an isolated disposable checkout, then restore the candidate. Do not do this in
a live or shared working tree.

## Release boundary

The prior safe release is blocked at main QA, not completed. Main/staging contain
d16ff9ea; last inspected production was 56063c14. This follow-up is isolated on
codex/medical-working-draft-contract-20261009. No unrelated root-checkout files
are included and no real clinical records are read/edited for local fixtures.

## Follow-up: make deployed acceptance exercise the new boundary

The existing two-user Medical acceptance checked API ordering/archive protection;
it did not exercise the failed working version in the browser runtime. The
acceptance now opens the primary user's actual Medical runtime, rejects browser
writes, injects quota and recovery-IDB failure, and invokes the normal reread.
The second authenticated user updates only the run-owned Medical record through
the existing guarded API helper. A fresh hydration must show that accepted change
while the primary user's original unsaved content remains in the review panel.
The test closes the browser before fixture cleanup. It uses no clinical screenshots,
traces or downloads. This is a runtime/recovery-panel exercise; the real form
submit is separately covered by the local regression above.

The synthetic player requires a Squad identity for the real Medical runtime.
Otherwise normal roster reconciliation archives it. The test adds exactly that
run-owned profile to the test browser's read response, preserving all existing
rows and rejecting identity collisions. No Squad write is made. Medical reads
and the peer's guarded Medical writes remain server-backed. This explicit data
fixture is not proof of Squad persistence or a completely unmodified read pipeline.
Candidate-code overlays remain explicitly labelled and cannot certify deployment.

The public frontend check now includes 13 files, adding Medical runtime wiring,
working ownership, recovery, store and verification. Each newly covered file has
a test proving stale bytes stop acceptance before login/fixture creation.

Follow-up local validation: 23 Node guard tests, six Chromium and six WebKit
working-draft cases, and `npm run qa:static` passed. The shared browser exercise
is run locally with synthetic remote responses; authenticated staging execution
is still pending and must not be inferred from these results. No product code
was changed in this follow-up.

### Acceptance startup correction

GitHub QA 37930029501 on c3c2ea5e failed the new shared exercise before its edit:
a record observed by the per-key-ready check was absent by the later browser
call that attempted to change it. Existing real-form retention regressions passed
in the same job. Local diagnostics also showed blocked startup Medical writes
and a failed hydration status, so a global `hydrated` flag is not a valid success
requirement while the test deliberately rejects those writes.

The exercise now explicitly awaits a fresh Medical/roster read, verifies the
expected central fixture and its authorized scope, and begins the edit within
one browser action. It does not retry the edit or weaken any post-save assertion.
Ten Chromium repetitions, all six working-draft WebKit cases, 23 guard tests,
syntax and diff checks passed after this correction. No product code changed.

This defines an edit-after-fresh-read acceptance case. The exact callback causing
the transient startup absence is not fully attributed; cold startup with all
bootstrap writes blocked is a separate unresolved acceptance case, not certified
by making this exercise start from an explicit read. Exact updated-commit GitHub
QA and authenticated staging execution remain separate gates.
