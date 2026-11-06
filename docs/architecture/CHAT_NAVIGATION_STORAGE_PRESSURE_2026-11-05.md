# Chat navigation under local storage pressure

Task owner: System/Security for this user-directed narrow Chat navigation fix.
Affected module owner/boundary: Meddelande/Chat. The user explicitly asked this
chat to implement the diagnosed navigation correction on 5 November 2026.
Base: `afa32b726474ea0648d51a47d757da240aabc694`.
Candidate branch: `codex/chat-navigation-storage-pressure-20261105`.

## Problem and correction

The widget stored selectedThreadId through the dashboard JSON storage adapter,
which catches storage failures. Reading the state immediately afterward returned
the old disk value. A full localStorage could therefore prevent switching chats,
even while server-backed messages remained available.

The small chat-widget-state module now owns current-session navigation. It
updates memory before attempting the existing best-effort preference write.
Open state remains session-only, and the existing two-field disk shape remains
unchanged. Read returns a copy so callers cannot mutate the current selection.
The first authenticated read may initialize from the persisted preference;
subsequent stale storage reads cannot override the session's selection.

Changing normalized user id, organizationId or teamId resets navigation to a
closed Team view. The unauthenticated widget render also observes the transition
so logout/login with the same account cannot revive an open stale conversation.
The initial disk read is deferred while authentication is still loading.

This changes navigation only. Message writes, API authorization, unread/read
receipt logic, central sync, backups and recovery data are unchanged. No cache
cleanup, migration or historical repair is performed. A preference that cannot
be persisted is not promised to survive a new page load.

## Verification

- `qa/playwright.chat-navigation.config.mjs`: **107 passed**, 19.2 seconds.
- 98 contract tests cover existing Chat behavior plus the new storage-failure,
  stale preference, reload, principal change and logout cases.
- Full application browser tests exercise REAL native localStorage exhaustion,
  denied widget writes and normal storage in Chromium and WebKit, including
  repeated thread switches and preservation of a sentinel storage value.
- Existing Chromium create-menu browser checks remain included.
- `npm run qa:static`: passed, including architecture budgets (existing 84 size
  warnings). New state module is 42 lines; the existing domain module shrinks.
- Final syntax checks and `git diff --check`: passed.

The first test attempt exposed two test-scope issues, retained in external logs:
(1) both old and new renderers can choose Team during cold startup before the
inbox is loaded; this is existing behavior, so the full-app reload check verifies
navigation remains usable, while the state contract verifies preference restore;
(2) WebKit can display the real install prompt asynchronously. The fixture now
dismisses that prompt via its normal button with a locator handler. It does not
force clicks through overlays. An extra Chromium-authored keyboard menu test was
also tried in WebKit and failed its platform-specific Tab focus expectation; it
is not part of the WebKit navigation acceptance scope. Its original Chromium
coverage remains intact. No product focus code or assertions were weakened.

The earlier release's intermittent live peer-DM failure is not established as
caused by native quota. This candidate fixes the independently reproduced quota
navigation defect; it does not claim to resolve every historical Chat incident.

## Delivery

Implementation and scoped QA are complete. No staging/main integration or new
production deployment is part of this instruction. The diagnostic-only branch
`codex/chat-cache-diagnosis-20261105` and its temporary monitor workflow changes
are excluded. A future release must use this isolated candidate and the required
project release checks after direct user authorization.
