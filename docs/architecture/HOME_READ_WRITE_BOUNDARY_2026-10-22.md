# Home reads and notification saving

Task owner: System / Security. Affected owners: Home / Dashboard (task alerts),
Chat (the existing notification helper). Operating model: distributed-specialist-v4.
Safe Lane candidate based on origin/main 09e9ccbcc8758a3879f49bbea582e3d4c4a3a531,
branch codex/home-read-write-boundary-20261022. This is a forward behavior fix;
no historical data repair, migration, cache clearing or production operation.

## Reproduced defect

Workspace chrome rendering and Home storage refresh call
markDashboardHomeSeenForCurrentUser. Previously it wrote the current wall-clock
time into football-dashboard-notification-seen-v1 on every call, including when
there were no eligible notifications. The protected storage wrapper correctly
interpreted each different value as a new save intent. A rejected write could
hydrate and render Home again, producing another different value.

A real Chromium app boot with a synthetic newer-server conflict reproduced
multiple POSTs for this key without any new tasks or user edits. Five focused
contract tests also failed on the original source. This proves this specific
render-to-write path; it does not attribute every previously observed production
Home conflict, or every slow login, to this cause.

## Decision

Use the latest observed eligible task creation time as the notification cursor.
Only advance it when it is newer than the stored cursor. Badge selection and
acknowledgement share the same task eligibility calculation. Keep the existing
storage key, user map, scope enforcement, central revision checks and recovery
pipeline. Do not suppress the shared save queue during rendering, debounce away
real edits, extend readiness timeouts or remove stale-write guards.

Unchanged reads become idempotent. Actual new task notifications still create a
save intent. A delayed task newer than the last observed task remains unread even
when its timestamp is earlier than the browser clock. Failed local writes leave
the cursor unchanged and remain retryable. A failed network request retains its
existing durable pending generation across reload.

## Validation

- Before fix: five new contract tests and the initial browser boot regression failed.
- After fix: 259 focused tests passed (251 API contracts, eight Chromium cases).
  These include nine new cases and existing sync/data-safety, Chat, workspace
  shell, lifecycle and Sessions cold-start online/offline regression coverage.
- New browser cases cover boot, reload, central refresh, relevant storage events,
  notification cache QuotaExceededError, accepted notification saves and a failed
  request followed by reload/recovery. Unchanged views send zero notification POSTs;
  the server cursor and colleague cursor are preserved.
- npm run qa:static and git diff --check passed. Existing architecture size
  warnings remain. No full deployed acceptance or production measurement is claimed.
- Test fixtures initially reused a task revision and emitted an unrelated storage
  event; corrected fixtures advance the server revision and emit the real task key.
  Final results above use that corrected model.

## Limits and next acceptance boundary

This is one completed boundary under the existing
[saved-work contract](SAVED_WORK_CONTRACT_2026-10-09.md), not whole-platform
certification. Other Home preferences, shell normalization and module startup
writes need their own evidence. Genuine concurrent updates to the shared Home
cursor map still use the existing revision-conflict policy; this change does not
introduce a per-user server merge. The existing timestamp cursor cannot distinguish
tasks sharing a timestamp or out-of-order tasks older than that cursor. Existing
future-valued cursors are not rewritten.

Continue forward per module: reads must not create new save intent; genuine edits
must survive their supported storage/network failure boundaries; two-user and
two-tab conflicts must remain explicit; old receipts must not acknowledge newer
edits; account/team switches must not replay foreign work; visible save status must
match committed local or central evidence. Keep the acceptance ledger tied to exact
tests and released commits. Historical work remains untouched.

Release is separate: this candidate needs the official Safe Lane release and
production verification after a direct user deploy instruction. The earlier
readiness-diagnostics PR remains an independent candidate.
