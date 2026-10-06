# Shared recovery visibility and retained save intent

Owner: System / Security for shared synchronization and saved-work safety.
Medical Room and Sessions retain domain/UI ownership. Three existing core files
change; no API/database, authorization rule, clinical rule or module UI changes.
Safe Lane is required. Base is released main `2eb24114edc282e4f964d05ab5bf4257cc5c8739`.

## Problem and evidence

Pinned staging run 37508787099 found an authenticated admin with the correct
selected date and edit access. The actual Sessions parser and storage contained
the test block; runtime/DOM did not. Hydration had failed after the guarded QA
browser blocked an incidental Medical recovery write. No overlay or clear/off
rule applied. This models a failed recovery write, rather than missing storage.

A deterministic local browser test reproduced the stale Sessions view with a
503 Medical write while a colleague's accepted Session revision was read.
Testing that the Medical draft stayed recoverable exposed two more problems:
central hydration bookkeeping could replace the pending generation, and the
queue cleared generic pending flags after HTTP 403 without a save receipt.
The latter kept bytes temporarily but could lose recovery intent on later reads.

## Smallest change

- platform-auth-boot.js emits the existing partial-read event after a recovery
  write fails, only for the still-current scope and already applied read keys.
  It rethrows the failure and does not emit ready or replay pending writes.
- data-safety-runtime-service.mjs treats hydration as read bookkeeping, not a
  user edit or acknowledgement; pending hashes, ownership and generations stay.
- central-sync-runtime-service.mjs retains pending intent after HTTP 403 while
  continuing the queue for other permitted keys. It does not automatically
  requeue the denied attempt within that flush. External recovery/user actions
  may retry after access is restored. No access check is weakened.

Server-accepted records remain the source of truth; local pending work remains
recoverable until a genuine acknowledgement. Never substitute a blanket reload,
clear local storage, restore full module snapshots, or report a failed save as
saved. Those alternatives risk data loss or mask the problem.

## Validation

The original regression failed before the fix. Three browser cases now cover
503, HTTP 403 and network failure: colleague Session data becomes visible,
Medical bytes and pending intent survive, no ready event is emitted for failed
recovery, and a subsequent successful recovery saves the draft. Unit contracts
cover hydration generation preservation for Medical, Sessions, Schedule and
Set Pieces, plus denied Medical edits/deletions continuing other module writes.

205 focused core contracts, 3 new browser regressions, 15 diagnostic/fixture node
tests and 31 workflow/Medical-boundary contracts passed. Syntax and architecture
budgets passed. The earlier full focused browser run passed 93 existing cases;
it exposed the HTTP 403 issue in the new case before that issue was corrected.
Final rerun and candidate-client staging acceptance are tracked in the PR.

## Limits and remaining proof

The production Medical incident confirmed only central presence, not the exact
version or affected user's UI. The fix explains a reproducible failure mode;
it does not claim every reported missing recommendation has this cause.
Candidate-client browser overlays are explicit pre-release tests. Full deployed
frontend/backend acceptance and production verification remain necessary.
