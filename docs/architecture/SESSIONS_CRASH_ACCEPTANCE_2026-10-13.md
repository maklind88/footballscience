# Sessions browser-crash acceptance — 13 October 2026

## Decision and ownership

System / Security owns this durability QA checkpoint. Sessions retains ownership
of its source data, saving rules and review decisions. This extends the
[restart matrix](SESSIONS_SAVE_ACCEPTANCE_2026-10-12.md) and
[selected-version compatibility evidence](SESSIONS_VERSION_COMPATIBILITY_2026-10-13.md).
No runtime, server, schema, permissions or release-rail change is required by the
observed results. Main/production baseline remains
`8f2333d58deee481c1fcff846931f8e84d4ab202`; this is local candidate evidence.

Problem: graceful shutdown can flush work and cannot establish that pending
operations survive an unexpected browser failure. Test the actual saving
modules and disk-backed IndexedDB at explicit transaction/receipt boundaries.

## Method

`qa/session-browser-crash.smoke.spec.mjs` uses the existing restart harness with
one additional Chromium-only `crash()` operation. `Browser.crash` crashes the
browser on its main thread; the test waits for browser disconnection and context
closure, checks the page is closed, then opens the same temporary profile.
There is no graceful close before the crash, journal reinjection, storageState
transfer, cache purge, or use of a person's browser profile. Cleanup removes
only the test-owned temporary profile after the test browser is closed.

For in-flight put/delete cases, a successful real IndexedDB request continuously
queues reads inside its transaction. This holds the transaction open while the
renderer remains responsive. Tests assert request success, lack of transaction
completion, and lack of completed client save/replay before crashing. The
pre-existing committed row is read back exactly after reopening. This is actual
transaction interruption, unlike the earlier explicit transaction-abort test.

The server is a deterministic in-memory revision/receipt model using the actual
Sessions merge protocol. It retains accepted operations across the browser
crash and detects reuse of an operation ID with changed content. The unobserved
receipt case holds the fetch response before the save client can inspect it;
it does not claim a real server/network outage. Exact retry payloads, ordering,
row contents, projected work and settled state are checked where applicable.

## Results

| Crash boundary | Observed recovery |
| --- | --- |
| A locally committed, before any send | Exact A row and visible work survive; still unsettled; replay confirms and removes A |
| B put request succeeded, transaction uncommitted | Online save has not completed or sent anything; B rolls back; prior committed A survives exactly and syncs |
| Server committed A, client has not observed receipt; B also pending | Both exact rows survive; A retries unchanged, then B; two total synthetic server effects |
| Client accepted A receipt, local delete uncommitted | A deletion rolls back; A and B survive exactly; retry reconciles A, then saves B |
| Client accepted A receipt, local delete committed, before next replay | Only B remains, projects correctly and syncs; A is not resent or used to clear B |

All five Chromium crash cases passed. No new product defect was reproduced.
The uncommitted B case demonstrates a limit, not recovery of unsaved text:
work interrupted before its local transaction commits is not guaranteed to
survive. The save promise did not report completion for that work.

## Validation and reproduction

- Chromium: 13 passed, no skips — five crash cases, four prior restart cases,
  four version-transition cases.
- WebKit: eight restart/version regression cases passed, no skips.
  The Chromium-only crash file is deliberately absent from its matcher.
- `npm run qa:static`: passed. Existing architecture warnings and missing local
  authenticated QA environment are not cleared or certified by this test run.
- New/changed JavaScript syntax and `git diff --check` checked before commit.

```sh
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-browser-crash.smoke.spec.mjs qa/session-browser-restart.smoke.spec.mjs qa/session-version-transition.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-browser-restart.smoke.spec.mjs qa/session-version-transition.smoke.spec.mjs
npm run qa:static
```

Standard Chromium smoke discovery includes the new crash file automatically.
Local evidence logs are `/private/tmp/fs-session-crash-chromium.log`,
`/private/tmp/fs-session-crash-webkit-regression.log` and
`/private/tmp/fs-session-crash-static.log`; these are transient runner outputs,
not production monitoring or remote CI evidence.

## Remaining boundaries / next step

This certifies the observed isolated Chromium process-crash boundaries only.
It does not establish OS power-loss or disk-failure durability, browser eviction,
WebKit/iOS process-crash behavior, full offline startup, service-worker upgrades,
revoked production access, or real database/audit exactly-once effects. A fresh
server baseline is supplied on reopening; authentication and full app boot are
outside this harness. Synthetic server effect counts are not DB audit evidence.

Next: the full application under combined storage quota/IndexedDB failure and
unavailable central saving, with honest save status, recoverable working content,
reload behavior and unresolved-review preservation. Keep module acceptance open
until its remaining matrix and deployed prerequisites are verified. Do not
purge cache or auto-resolve reviews to make acceptance pass. No new deploy,
main integration, remote CI or real-user data mutation is part of this checkpoint.
