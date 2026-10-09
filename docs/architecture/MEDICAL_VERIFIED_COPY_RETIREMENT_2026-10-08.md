# Medical: explicitly retire an exact centrally verified rescue copy

Owner: System / Security for save integrity and the central-read boundary.
Affected owners: Medical (private clinical state and review UI), Platform Shell
(authenticated bridge). Continuation of PR #269; no release is authorized.

## Decision

A retained draft is not proof of central saving. A global sync indicator, cached
server value or higher revision is also insufficient. Those values can describe
a different edit, account, projection or generation. Using normal hydration as a
check could mutate caches and trigger existing replay/write-back behavior.

Add an isolated, user-initiated fresh Medical GET. It uses the existing app-state
read policy, auth transport and fresh-source contract. The server explicitly
states whether the returned Medical entry is the private view. An older server
without this evidence, a coach projection, missing key, error or invalid revision
cannot authorize removal. API state ownership, permissions and writes are unchanged.

After checking a selected local copy, show a separate removal button only when
the entire serialized value matches exactly. The button explicitly explains that
both this copy and its previous-state backup will be removed from this browser.
Previous content is inspectable; the full recovery envelope remains downloadable.
Clicking removal performs another fresh GET before the local transaction. No
copy is removed automatically, on viewing, during hydration or at capacity.

## Integrity contract

- Principal scope, token and Medical write-role eligibility are checked before
  and after the asynchronous GET. Responses are not installed in editor/cache.
  A 15-second deadline covers the entire response, including its body; late
  responses lose their current-request guard and cannot certify removal.
- Server `medicalRecoveryRead.private` is computed from the existing filtered
  Medical entry and existing private-role rule. It is never a client request flag.
  Client Medical edit permission remains an additional gate for the review UI.
- Value and positive integer revision come from the same authorized response.
  The revision must not predate the copy's known observed base. Unknown base is
  allowed only with the same exact current value and a positive server revision.
- Equality is byte-for-byte for the complete serialized state. No clinical field,
  unknown property, display preference, array order or whitespace is ignored.
  This deliberately favors retaining a copy over incorrectly certifying it.
- The selected UUID, owner, value, previous value, base revision and creation time
  must still match the stored envelope. A single IndexedDB transaction removes
  its payload and catalog entry; request success alone is not completion.
- Access and the local save generation are checked across asynchronous work and
  again before deletions and on delete-request success. A detected change aborts
  the pending transaction. Account/team change removes private review UI through
  the existing event path. A changed context after transaction completion cannot
  turn an uncertain presentation into a false claim that the copy was kept.
- Newer/divergent copies are independent rows. Concurrent retention is serialized
  with retirement by the database transaction. Two tabs retiring the same row can
  complete only one removal; the second does not remove any other generation.
- Removing a verified duplicate frees its reserved local capacity. Storage-health
  counts update from the database; there is no cache sweep or bulk cleanup.
- LocalStorage, central pending markers, global save errors, the active editor,
  other modules and server content are not modified by verification/retirement.
  A successful check is not a blanket acknowledgement of other work.

## Compatibility and failure behavior

The additional GET response field is additive. A new client talking to an older
server keeps its copy and reports that verification is unavailable. An old client
ignores the field. IndexedDB schema stays at version 1; payload and catalog are
retired atomically, so rollback code sees either the complete original entry or
neither row. No migration, new dependency or database schema is introduced.

A committed central write with a lost response can be recognized by this fresh
read if the value still matches exactly. If later central work differs, preserve
the local copy. A server write after the second GET remains a legitimate later
revision; this action is evidence of equality at the checked revision, not a
lock on the server's future state.

Normal current-revision Medical POSTs preserve their serialized input under the
existing `protectMedicalStateValue` contract. Stale writes may merge; merged or
reformatted results need review and cannot be retired through exact matching.

## Scope still open

This completes only the explicit retirement gate for identical copies. It does
not merge a differing copy, restore it into central state, retire unmatched old
versions, resolve arbitrary clinical conflicts, promise permanent browser storage
or certify all platform modules. At the rescue limit, unmatched copies still
require review/export; they are never silently pruned.

The copied previous-state backup can contain historical information that differs
from the current central copy. The explicit removal action includes that backup;
this is why there is a separate user choice and an inspect/download path instead
of automatic garbage collection.

## Validation

All data is synthetic and all API storage/auth calls in contract tests are mocked.
The browser matrix covers review without deletion, exact match, mismatched value,
old revision, coach projection, wrong account, unavailable proof, server changes
between checks, access/new edits during checks, abort after successful requests,
concurrent variants, concurrent retirement, capacity reuse, unchanged editor and
real auth-bridge integration. Server tests exercise the existing Medical role
policy and absent data. Shared app-state/database contract tests cover the additive
response field. Chromium/WebKit and final static results are recorded in the PR.

The integration fixture intentionally rejects ordinary app-state writes. Waiting
for globally successful hydration in that scenario was incorrect; the test now
waits for authenticated app startup and completion of the initial read, and proves
that the isolated verification GET does not alter the pre-existing sync state.

Final local results for this follow-up:

- 166 API contracts passed (existing app-state/database contracts plus 30 focused
  central-read/policy cases, including the complete-response deadline).
- 40 Chromium rescue/retirement cases passed after fixing the two-tab fixture
  to select its immutable row before starting concurrent removal. The preceding
  broad run also passed all 85 central-revision and six Medical-visibility cases;
  its sole failure was that corrected fixture ordering issue.
- 46 WebKit rescue/retirement/Medical-visibility cases passed on the final code.
- `npm run qa:static` (including `check`) and `git diff --check` passed. Existing
  architecture warnings are unchanged (84 oversized module files).
- The full authenticated bridge and actual Medical review panel were exercised;
  all test values and API storage/auth responses were synthetic.

These are overlapping suites, not a combined count or platform-wide approval.
Production and the prerequisite release remain outside this local validation.
