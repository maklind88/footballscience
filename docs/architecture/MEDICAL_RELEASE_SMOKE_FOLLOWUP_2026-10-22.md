# Medical release smoke follow-up

## Ownership and scope

Medical owns this bounded follow-up to its release, as requested by the user.
Schedule remains the product/data owner and System / Security / Release remains
the owner of shared release infrastructure. Only the Schedule live smoke and its
test helpers/coverage change. No application, permissions, sync, database,
workflow, deployment-gate or user-data changes are included.

## Evidence

Medical recovery commit `0ec627a5` reached production in GitHub run `39881799814`.
The deployment, postdeploy checks and Medical live boundary checks passed. The
final Schedule live smoke exceeded its 90-second test-body budget. Its `finally`
cleanup then used a closed page and masked the original timeout location.
The run did not publish trace artifacts or the exact synthetic record identity.
The precise original timeout cause and any leftover record remain unconfirmed.

The test could also select a future planner window, reload into the current
window and assert against the now-hidden target date. This is a confirmed gap in
the test, not proof that it caused the recorded production timeout.

## Correction

- Navigate back to the recorded date after reload before checking persistence.
- Arm cleanup before submission using a unique, run-owned title and exact date.
- Log only that synthetic identity and cleanup state, not account/clinical data.
- Run cleanup in a test-scoped fixture with its own teardown budget and fresh
  browser context. The existing test-body timeout is unchanged.
- Reauthenticate and verify the same account/club/team before deleting anything.
- Require exactly one matching UI event and the existing delete confirmation.
- Require central absence even when the local cache lacks the test record.
- Preserve both test and teardown failures; do not suppress failed cleanup.

## Validation and limitations

Seven contract tests include an actual nested Playwright timeout and simultaneous
cleanup failure. Three local browser tests cover calendar-window navigation and
closed-page cleanup. Four Medical Recovery browser checks pass unchanged.
No real account credentials or production data are used by these local tests.

This candidate does not remove any unknown record from the earlier live run.
That requires identifying the exact record under the dedicated QA account; never
bulk-delete events whose titles merely begin with `QA Live`. Original Medical
draft recovery is also not established by these test changes.
