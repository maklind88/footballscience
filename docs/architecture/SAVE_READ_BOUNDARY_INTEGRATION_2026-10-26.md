# Saved-work read boundaries: combined candidate, 26 October 2026

Task owner: System / Security. Affected boundaries: Home task notifications
(Home / Dashboard and its existing Chat helper), Platform Shell navigation,
and release QA diagnostics. These are this chat's existing candidates, not
another specialist's unfinished work.

Base: `9aadc49223deea5a2c9d9f174fc5e10ea7e39a11` (verified origin/main).
Branch: `codex/save-read-boundaries-20261026`.

## Scope and decision

Combine PRs #281, #282 and #283 on the current main in separate merge commits,
preserving their original ancestry so they remain independently reviewable.
No conflicts occurred. Only three product source files differ from main:
`dashboard-chat-thread-runtime.mjs`, `workspace-shell-controller.mjs` and
`workspace-runtime-composer.mjs`. Their changes are unchanged from #282/#283.

- Home acknowledges the latest eligible notification only when its timestamp
  advances the user's saved cursor. Rendering unchanged Home creates no save.
- Boot and page navigation normalize settings in memory and remember the page
  locally, without publishing the shared settings object. Explicit settings
  handlers still save through the existing pipeline.
- QA diagnostics measure sign-in stages and bounded request counters. They do
  not collect user content or alter product timeouts, authentication or retries.

The existing APIs, revision checks, permissions, pending generations and recovery
stores remain authoritative. No historical repair, cache deletion, schema change,
new persistence system or production write is part of this integration work.

## Failure reproduced and corrected

PR #283's GitHub run 39878850033 failed one Chromium assertion: the legacy
workspace test expected `activeWorkspaceId` to be removed from stored settings
just by booting. The combined candidate reproduced that exact failure locally.
The visible active page was already correctly Home. The old assertion depended
on the automatic settings write that #283 intentionally removes.

The regression now proves the intended contract end to end: legacy shared page
information does not control the active page; the stored settings remain byte-for-
byte unchanged across boot, navigation and reload; a real sidebar settings edit
still saves and excludes the device-local active page from its shared payload.
Home access settings are also preserved by that explicit save.

The central-backend fixture now includes a legacy shared active page as well.
Its existing zero-write tests require the raw central value to remain unchanged;
its explicit-save tests require the obsolete navigation field to be excluded.
Central reads already strip the legacy active page from the local cache in
`sanitizeWorkspaceHubStateValue`; the fixture initially expected the raw server
bytes there too. Both engines reproduced that mismatch. The corrected test
expects the normalized local projection while still requiring zero POSTs, an
unchanged server record and no pending save. Local-only boot and central hydration
therefore have separate, explicit expectations.
Home and shell boundary tests are included in the persistent WebKit saving suite.

A broader run also exposed timing sensitivity in the Schedule token-rotation
fixture: it injected a noncanonical event into a legacy empty schedule, then a
later read normalized its JSON field order while the receipt was held. One extra
write attempt violated the exact-one-write assertion. The original fixture passed
six baseline-main runs but failed one of six repeated candidate runs, so this is
not claimed to be a reproduced production-main defect. The receipt fixture now
uses the same normalized Schedule/event format as actual edits, an already-imported
baseline and a fixed date, following the neighboring account-switch fixture.
All receipt, revision, pending-draft and exact-one-write assertions are retained.
Both receipt variants then passed five times each. A real Schedule UI edit also
passed save/reload verification. Arbitrary legacy/raw formatting normalization is
not certified by this correction and remains a separate persistence boundary.

## Validation

Final local coverage: 343 API/contract cases, 112 distinct Chromium cases and
13 distinct WebKit cases passed across the runs (468 distinct cases total).
Repeated attempts are not counted as additional cases.

- `npm run qa:static` passed, including syntax, release rules, storage/security
  guards and architecture budgets. Existing architecture size warnings remain.
- The initial 107-case Chromium run had 105 passes and the two fixture failures
  described above. All six shell cases passed after correcting the projection
  expectation; both Schedule receipt variants passed five repeated runs each.
- Four additional Chromium cases cover legacy navigation, reload, back navigation
  and profile changes; a fifth covers an actual Schedule edit and reload.
- The initial 13-case WebKit run had 12 passes and the same shell projection
  mismatch; all six shell cases passed after correction. The union of final
  passing cases includes Home cache pressure, failed writes, shell navigation,
  explicit settings, offline edits and peer visibility.
- Syntax checks for all additionally edited test/config files and
  `git diff --check` passed. No timeout, production assertion, or required failure
  was bypassed. Full GitHub CI is reported on the combined PR and exact SHA.

## Limits and release status

Local browser tests use synthetic HTTP state and authentication. They exercise
real app handlers and browser storage, but do not certify the actual database or
production behavior under concurrent users. Existing same-timestamp notification
and shared-map conflict limits from #282 remain. Concurrent whole-settings edits
retain the existing revision policy; this is not field-level settings merging.

This reduces unnecessary writes and conflicts. It does not bound snapshot storage
growth, eliminate all local reviews, or complete the platform-wide saving plan.
No staging/main/production release has been performed for this combined candidate.
The earlier three evidence documents describe their original checkpoints; this
document describes the integration and the correction of the full-CI failure.
