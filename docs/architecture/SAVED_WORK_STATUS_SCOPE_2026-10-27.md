# Saved-work status scope, 27 October 2026

Task owner: System / Security. Affected owner: Platform Shell for the shared
profile save indicator and lifecycle binding. Module source data and save/review
protocols remain with their existing module owners.

Base: `845a0ed95bbd8795bf574a8aeb0c9f37ed903250`.
Candidate branch: `codex/save-status-scope-20261027`.

## Reproduced defect and decision

The shared indicator counted every pending manifest entry in the browser, while
its last saved/read timestamps had no principal provenance. An old account could
therefore cause false pending status for the next account, or an old successful
operation could produce a positive Saved badge for a different account or after
sign-out. The pending time also came from the browser-global lastSavedAt.

Four deterministic tests failed before the product change: foreign pending work,
foreign success after account change, foreign success after sign-out, and a pending
timestamp borrowed from another owner. A fifth assertion proved the user-change
handler did not directly refresh the indicator.

Use the existing read scope (actor, organization, club, team, role), not a new
identity or persistence framework. Actual successful full reads and writes attach
the captured scope to their existing in-memory timestamps. Existing stale-context
checks still run first. Partial reads do not claim a complete read. Failure and
obsolete responses cannot relabel previous success.

A pure display projection admits positive proof only for the current nonempty
scope. Known foreign pending entries are excluded from this account's indicator;
unowned entries remain pending without an attributed timestamp. The display does
not replay, acknowledge, remove or rewrite retained entries or payloads. Missing
scope metadata, including older bridge versions, cannot certify a save. The
user-change event refreshes the indicator immediately before any reload branch.

No API, database, permissions, token checks, queue behavior, clinical merge,
conflict resolution, cache eviction or historical data is changed.

## Verification

- Four original regressions and the lifecycle assertion fail on the old behavior.
- Scoped contract tests cover positive current proof, reads versus writes, unknown
  ownership, unchanged retained data, and actor/organization/club/team/role changes.
- Existing auth operation tests additionally assert that failed/obsolete operations
  preserve the original timestamp scope; accepted reads and writes attach theirs.
- The full-app browser case uses real auth boot, hydration and indicator with
  synthetic HTTP. It holds the new account's reads and writes, verifies that the
  old Saved badge disappears, then admits a new read without claiming a new save.
- Existing Medical failure/reload/cross-tab cases remain required.

Local validation: `npm run qa:static`, `git diff --check`, 313 API contracts,
95 Chromium cases (91 existing integration cases plus four scope/local-issue
cases), and four WebKit cases passed: 412 cases total. The original four failing
regressions are included in the 313, not counted twice. The final SHA belongs to
the candidate commit/PR. These tests do not certify production HTTP/database
behavior or every module's saving protocol.

## Remaining boundaries

This is a correction to shared status, not a resolution of the original device's
storage incident. Unknown-owner work and unresolved errors remain visible rather
than being cleared. Global legacy central error strings still lack scope
provenance and can conservatively show attention after a switch; this change does
not suppress them. Existing snapshot timestamps describe browser cache existence,
not central acceptance or local durability of the current edit.

The next evidence gate remains the existing forward-evidence plan: complete
known-store measurements on the affected device, distinguish replaceable cache
from unsent/review work, measure future growth, then validate bounded storage and
multi-user flows per module. Do not delete old work or automatically resolve
historical local reviews. No staging or production deployment is part of this
implementation request.
