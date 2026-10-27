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

## Candidate refresh, 2026-10-23

The preceding sections are historical evidence, not the current release state.
Medical read/save isolation subsequently shipped on main `2e263ce4`, with the
Safe Lane and production verification passing. This does not establish which
guard caused every earlier beforeunload warning, nor recover unidentified old
test records.

The QA-only changes are now prepared separately on
`codex/medical-smoke-ready-20261023`, based on main `009acef3` (which includes
`2e263ce4`). Medical owns this
bounded release follow-up; Schedule owns product data and System/Security owns
shared release infrastructure. No Schedule product code, central sync, clinical
data, or protection guard changes are included.

Local validation covers the helper contracts, real timeout teardown, date-window
navigation, and cleanup after the original browser page closes. The authenticated
production probe has not been rerun as part of this preparation. It must pass in
the later user-authorized release; do not dismiss a pending-write failure as a
test flake. Do not delete old unowned Schedule records.

No main/staging integration or deployment is authorized by this preparation.

## Authorized release validation, 2026-10-26

The user requested Live in the Medical chat. The combined candidate is based on
`9aadc492`; its clinical recommendation rules require Safe Lane validation.
The first local full QA stopped before publishing on the recovery verification
test: a Medical POST arrived during its read-only assertion. The trace showed
removed-player archival, timestamped before the verification GET, for the
synthetic player omitted from the mocked Squad response. The same test passed
alone, confirming that timing affected the assertion.

The Medical test now returns the matching synthetic Squad profile and asserts
zero Medical writes at startup, after verification, and after local-copy removal.
No archival, recovery, or central-sync production code was changed. The recovery
suite passed 16/16, the amended auth-bridge test passed three sequential runs,
and Medical state/Squad sync contracts passed 47/47. These local checks do not
constitute production verification; the official Safe Lane must still pass.

The corrected candidate `0a3cb410` passed local full QA (4210 passed, 3 skipped),
Staging Deploy `40414478889`, and main QA `40416462947`. Production workflow
`40418013519` stopped before its deploy job: the late-account Medical receipt
test timed out during its explicit baseline save, before any account switch.
Its trace showed a synthetic `qa-player` absent from Squad being archived;
the archival write advanced revision 4 to 5, then the fixture baseline write
received 409 at revision 4. The production deployment job was skipped.

That test now supplies its own matching synthetic Squad profile. Its receipt,
revision, token, and cross-account assertions are unchanged; five sequential
focused runs pass. No shared sync, authorization, or clinical write implementation
was changed. Existing production monitor-mode health checks passed after the
stopped workflow. A new successful release is still required.

## Published release and bounded follow-up, 2026-10-27 UTC

Medical candidate `72f214ce` was published in production workflow `40425176457`.
Full local QA passed (4210 passed, 3 skipped); staging `40422158874` and main QA
`40423903971` passed. Production promotion, postdeploy, staging isolation and
Medical's 11 HTTP boundary checks passed. The final live suite reported six
passes, one skip and one failure in Schedule probe cleanup. This is not a fully
green release result and must not be described as such.

The exact run-owned probe was
`QA Live 1793061123580-80c2357a-82ce-4b8b-bebf-d2c39d49e4a3`, dated `2026-10-11`.
Creation and reload completed. After the delete confirmation, the UI still
contained the title; the central absence assertion was never reached. The run
published no downloadable trace artifacts. Its current central presence remains
unverified. Never delete by prefix or under an unrelated user/team.

Read-only investigation reproduced a separate, concrete Schedule defect:
`removeScheduleEvents` captures `getState()` before awaiting confirmation, then
mutates that captured object, while `writeState()` persists the current runtime
object. Replacing the runtime state with an equivalent clone while confirmation
is pending gives this deterministic result after confirmation:

```json
{"originalEvents":0,"currentEvents":1,"savedEvents":1}
```

The reproduction uses only a synthetic in-memory event and the actual Schedule
controller, with no network, real account or user data. It establishes a stale
state deletion bug, not proof that the same race caused the recorded live failure.
The shared overlay guard also does not include `role="alertdialog"`, used by the
danger confirmation, but its involvement in the incident is not established.

Medical owns this release follow-up; Schedule owns event mutations and
System/Security owns shared reload/overlay behavior. No product fix was applied:
the user has been asked to approve a narrowly scoped Schedule correction before
crossing that boundary. Proposed validation: deletion after state replacement,
preservation of unrelated/new events, cancellation, changed permissions and the
existing Schedule delete/undo browser flow. Do not change shared sync or weaken
the live cleanup assertions to hide the problem.

The original dedicated live QA account credentials are unavailable locally.
Cleanup of the exact historical probe still requires authenticated access to
that same account/team. The old root authentication snapshot has not been used.
No new release, main/staging integration or production data write was performed
during this follow-up.
