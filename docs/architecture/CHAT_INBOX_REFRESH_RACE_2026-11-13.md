# DM inbox refresh ordering

Task owner: FS Player specialist for this explicitly user-authorized, narrow
Chat reliability fix. Affected boundaries: Chat runtime and Chat release QA.
This is not a transfer of general Chat ownership.

Base: `119e93488e8d218e7e26dd457c3aa2c1dd5addd5`.
Candidate: `codex/dm-reload-race-20261113`.

## Observed failure

Production Deploy run `43366614930` deployed the preceding FS Player candidate,
then failed the peer-DM live check: after reloading the sender, its DM row did not
appear. The earlier API send, peer unread badge, peer message display and server
read receipt had succeeded. Two later monitor runs passed unchanged code.

The failed run has no retained browser/network trace. The precise response order
of that historical run cannot be recovered. The defects below reproduce the
missing-row behavior locally; they are not proof that every historical DM failure
had the same cause. The existing live assertions and timeouts remain unchanged.

## Reproduced defects and correction

1. The live helper clicks Team, leaving the pointer over that row. The widget
   deferred the entire inbox update until pointerleave, even when the response
   contained a newly created DM. A full-app test with the same pointer position
   reproduces the missing-row timeout despite the successful inbox response.
   New rows now append immediately while existing pointer targets remain in place;
   normal ordering resumes on pointerleave. No test-only mouse move was added.
2. Inbox and active-thread reads run independently. Several callers suppressed
   the inbox render, assuming the message response would render both. If messages
   finished first, a late inbox updated memory but not the visible conversation
   list. Both completions now render independently, including late inbox errors.
3. The inbox runtime accepted `forceNetwork` but did not forward `__forceNetwork`
   to the existing read adapter. An explicit open/retry could reuse a settled or
   in-flight old inbox snapshot. The flag now reaches the adapter, which already
   strips internal flags from the URL and retains request pacing/backoff.
4. The app injected the summary timestamp setter under the wrong dependency name.
   Correct wiring restores the 15-second background refresh budget. Only explicit
   open/switch/retry actions use `immediate`; forced background notification reads
   retain their budget, and the shared network pacing still applies.
5. An older inbox response could replace a newer response. A request sequence
   check now discards superseded inbox results before applying data or status.

The source of truth remains the Chat API. No message writes, read receipt rules,
authorization, tenant filtering, storage contracts, migrations, cleanup, backups,
central sync or FS Player data were changed. No user messages were sent/deleted
during local verification; browser fixtures use synthetic users and mocked APIs.

## Regression coverage

`qa/chat-inbox-refresh.api.spec.mjs` covers both response orders, late failure
visibility, forced reads through the real cache adapter, stale success/failure
responses, background pacing, explicit refresh and the app dependency wiring.
Before correction, the message-first, late-error, cache and wiring checks failed.
The stale-response checks also failed before their guard was added.

`qa/chat-inbox-refresh.smoke.spec.mjs` runs the full app with controlled network
responses in Chromium and WebKit. It introduces a DM after the closed-widget
snapshot, holds the new inbox response until active-thread loading, and verifies
the visible DM, unread badge/read acknowledgement or sender read receipt, followed
by reload and reopening. The pointer stays over Team while the new DM arrives;
the test also asserts that Team's bounding box does not move. This test does not
merely increase a timeout or retry the failing live test. The focused Chat config
includes both new suites.

Final verification:

- All local Chat suites through the standard Playwright config: **174 passed**.
- Final pointer-hover/reload tests repeated three times in each browser:
  **12 passed** across Chromium and WebKit, without retries.
- Existing WebKit navigation tests with full, denied and available localStorage:
  **3 passed**.
- `npm run qa:static`: passed, including syntax, release rules, storage/security
  policies, migration contracts, performance and architecture guards. Existing
  architecture debt warnings remain (84 module files over the size target).
- `git diff --check`: passed.

Before the pointer-hover guard was added, the same full-app test failed because
the DM row never appeared. Its local trace was preserved outside the repository
at `/private/tmp/chat-dm-hover-red-20261113.zip`. Earlier no-hover repetition
passed 20 times, which is why the pointer position is now part of the regression.

## Delivery boundary

This instruction authorizes diagnosis and correction, not a new deployment.
Staging, main integration and production remain untouched. A later authorized
release must run the normal release gates and the unchanged authenticated live
peer-DM smoke against the deployed SHA; local mocks cannot prove live server
availability or production account configuration.
