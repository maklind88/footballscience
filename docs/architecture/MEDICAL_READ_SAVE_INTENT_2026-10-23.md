# Medical read/save intent isolation

## Scope

Medical-only candidate from origin/main `0ec627a5`. No release authorized for
this follow-up. Earlier Schedule smoke follow-up commits remain on their own
branch and are not included here.

## Reproduced problem

`ensureMedicalState()` synchronized Squad-owned roster fields and availability,
then called `writeMedicalState()` even though no clinician edited anything.
This entered the clinical save/recovery path. A quota or security failure could
therefore create a recovery copy from a derived roster refresh. It could also
write an older in-memory clinical snapshot over a newer cached snapshot merely
because a player's roster metadata changed.

Three new/updated contract cases failed against the original implementation:
the read unexpectedly wrote storage, including with denied storage. The added
stale-cache regression protects both recommendations and Medical Plans.

## Minimal correction

Project the current Squad roster/status into Medical memory without invoking a
clinical save. Keep the existing explicit write path unchanged; real edits still
save the current projected roster along with the clinical change. Squad remains
the authoritative source of roster metadata. No sorting or percentage rules change.

Do not remove or reclassify existing recovery copies. Do not suppress genuine
memory-only draft warnings. Do not change the existing removed-player archiving
path, database sync callbacks, permissions, central sync, or other module code.

## Evidence and limitations

- Contract checks cover read-only projection, newer cached clinical generations,
  quota/security failure, real-edit recovery, writes, scope changes, archiving,
  Squad boundaries and Session Planner selectors.
- New browser coverage opens Medical with denied cache and recovery storage,
  changes tabs and reloads without edits, and asserts no recovery warning,
  beforeunload dialog, or Medical POST.
- A second browser case uses the real percentage button and Medical Plan form.
  Its synthetic HTTP server accepts revision-checked central writes. Both saved
  values are read after reload and in a new independent browser context with no
  shared local cache.
- Existing browser coverage exercises network/storage failures, concurrent
  drafts, newer peer data, recovery exports, and recommendations in Sessions.
- HTTP is mocked; the Medical shadow API is disabled in the synthetic fixture.
  This is not proof of production database persistence or the historical cause
  of every missing recommendation. The originally affected tab was closed and
  its memory-only drafts cannot be reconstructed by this change.
- The earlier production smoke's beforeunload dialog was confirmed, but its
  exact originating guard was not identified. This fix addresses a reproducible
  Medical cause, not a claim that every beforeunload warning is erroneous.

Release risk: Safe Lane, because clinical persistence behavior is involved.
No main integration, staging, production write, or deployment in this task.

## Validation completed

- 66 targeted contracts passed: runtime state/write/operations, working drafts,
  recovery failures, roster selectors, Squad-Medical sync and Session selectors.
- 46 browser tests passed: save intent, saved visibility, working drafts,
  recovery surface and draft recovery. These include the two new cases above.
- `npm run check`, `npm run quick:ui` and `git diff --check` passed.
- Initial new browser test used a training-only accessible label on a fixture
  match day. Corrected the test to target the player's percentage control for
  either activity; no product rule was changed to accommodate the fixture.

## Authorized Safe Lane follow-up

The user subsequently authorized `Deploy safe`. The first full run was stopped
before staging/main/production after 3,572 passing tests and eight failures in
Medical replacement fixture preparation. These fixtures waited for an automatic
roster-normalization write after a coach-to-medical role change. That write is
intentionally absent now. Their seeded legacy pending draft correctly remains
protected until an explicit replacement is saved.

`saveMedicalFixtureBaseline` now performs that explicit synthetic baseline save
after verified editable hydration (or the existing authorized archive write).
Only three Medical fixture setup sites in the central revision suite change.
All original assertions of receipt reconciliation, revision counts, retained
recovery copies, lost responses, manifest/cache failure and organization
isolation remain. The 17 affected browser scenarios pass; no shared sync or auth
product code changes were needed. The official Safe Lane must run again in full.
