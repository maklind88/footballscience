# Asynchronous QA readiness correction — 2026-10-19

Owner: System / Security (test infrastructure and release diagnosis).
Affected test boundaries: Medical draft recovery and Presentation Mode local media.
Product data ownership, saving, permissions, and runtime code are unchanged.

## Failure and cause

The production workflow 38945848940 stopped before deployment when the Medical
quota-failure test attempted to edit a synthetic record before it existed.
The test used a direct async predicate in `page.waitForFunction`.

In installed Playwright 1.59.1, `frames.js` calls the predicate and checks its
immediate return value for truthiness. A Promise is truthy; resolving that Promise
to false completes this wait without polling again. An isolated Chromium check
confirmed that an always-false async predicate completed with false, while a
synchronous false predicate timed out.

Therefore, the earlier interpretation that the readiness check proved the record
had appeared and was subsequently removed was incorrect. The check did not prove
readiness. Temporary Linux diagnostics reproduced 2 failures in 30 repetitions
(run 39343773853, commit 61e805d3). The failures occurred before initial Medical
hydration/view loading completed; account and scope stayed the same.

## Correction

Both direct async predicates under `qa/` now use `expect.poll` around
`page.evaluate`, asserting that the resolved value is true. Medical waits for its
synthetic record; Presentation Mode waits for the image blob in IndexedDB before
reloading. The second occurrence spanned multiple lines and was found by the new
guard, correcting the initial single-line search result.

`qa/browser-wait-contract.api.spec.mjs` rejects direct async predicates, including
multiline calls, throughout QA JavaScript files. It is intentionally a narrow
source guard; it does not detect every indirect Promise-returning callback.
Temporary browser instrumentation and the diagnostic CI job are removed from the
final diff. No sleeps, weaker assertions, retries, or product workarounds are added.

## Evidence and limits

- `npm run check`, syntax checks for the changed QA files, and `git diff --check` pass.
- Targeted final candidate: 27 tests pass (25 Medical, one Presentation Mode, one guard).
- The guard detects the original Medical code and accepts the corrected code.
- Full Medical recovery coverage includes local quota failures, IndexedDB failure,
  reload recovery, concurrent generations, and account/permission isolation.
- This correction explains this release-gate failure. It does not establish that
  every reported live saving/cache problem is resolved or certify all modules.
- No production deploy, migration, clinical-data mutation, or main integration is
  part of this diagnostic correction. Release verification remains a separate step.
