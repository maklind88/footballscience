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

## First authenticated follow-up

Production Monitor `39895060558`, candidate `e9effe58`, confirmed central save
and cleanup of its exact synthetic record. The newly isolated failure was
`page.reload` waiting for DOMContentLoaded; the test-body budget expired.
Medical's 11 read-boundary checks and the other live tests passed. Postdeploy,
auth health, staging isolation, backup freshness and read-only restore checks
also passed. No new deployment or restoration was performed.

The follow-up diagnostic records only the browser dialog type and bounds the
reload attempt to 20 seconds within the unchanged 90-second test-body budget.
It must continue to dismiss beforeunload rather than silently discard drafts.
The cause of the stalled reload is not yet established.

## Confirmed reload blocker

Production Monitor `39896180873`, candidate `0c726558`, reported a `beforeunload`
dialog at reload. The handler dismissed it, correctly preserving unsaved work,
so navigation never completed. Its exact synthetic record was centrally saved
and its cleanup was verified. The same six other live checks passed, including
Medical 11/11, with one intentional staging-only skip.

This establishes why navigation stopped, but not which pending write generated
the warning. Medical's memory-only recovery guard and the library in-flight
guard must not be disabled or automatically accepted to make the check green.
The next investigation must identify and secure that pending work before any
product change. A read-side Medical roster sync can call `writeMedicalState`;
that is a candidate path, not an established cause of this live incident.

The candidate remains blocked for integration/release. Eight local contracts,
three focused browser checks, four unchanged Medical Recovery browser checks,
syntax/diff checks and live-suite discovery pass. No `main`/staging integration
or deployment was performed during this follow-up. The unknown record from the
original release run remains unverified; neither follow-up deletes old records.
