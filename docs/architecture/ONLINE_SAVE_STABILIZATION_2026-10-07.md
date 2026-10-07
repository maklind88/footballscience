# Online saving stabilization

Task owner: System / Security. Affected owners: Medical (save boundary only),
Sessions (review explanation only), Platform Shell (profile diagnostics entry).
User direction: stabilize online saving and short network interruptions before
expanding full offline support. Existing queues and recovery copies must survive.

## Decision and scope

Pause additional offline-module activation in this workstream. Do not disable
existing journals or replay contracts, clear browser storage, automatically choose
central/local versions, or roll back browser database schemas. Central accepted
revisions remain authoritative; a read cache or queued request is not a receipt.

Start from production de216cc27c6f92166bc605e137f22288a5bb9190. The previous release
restored the observed dated recommendation in Medical/Sessions, but did not solve
storage exhaustion. This candidate makes rejection explicit and exposes a safe
measurement surface before changing cache retention or migrating stored content.
No database, permissions, clinical rules, conflict resolution or stored schema change.
No additional module is enabled for offline use.

## Evidence

- Medical's quota fallback ignored the queue's return value and exceptions.
  Queue guards previously returned undefined on rejection and successful enqueue.
  New regressions fail on the released code: rejected/unknown/thrown Medical
  enqueue and the new positive acceptance receipt. Guarded-skip tests preserve
  the existing scope/read-only/hydration behavior.
- The authenticated production Sessions review showed 110 retained versions over
  75 dates, with up to 20 versions on one date. Only DOM counts were recorded;
  no version choice, save, deletion or clinical edit was made. The review tab
  was closed. These counts do not establish 110 real concurrent-edit conflicts.
- Sessions' durable journal and legacy snapshot review are separate sources.
  Set Pieces also consumes the generic journal, so older documentation saying it
  is entirely unwired is no longer current. Medical's memory fallback is not a
  durable journal. Do not extrapolate one module's proof to another.
- The actual native storage distribution has not yet been measured. The new
  diagnostic must be deployed before it can measure the affected live origin.

## Candidate behavior

- Central queue returns true only after insertion. Existing guarded skips retain
  their undefined return; persistence failures retain false. Medical accepts only true.
  Existing ownership, hydration, pending-generation and revision checks remain.
- Medical reports full-cache queue acceptance only on true. Rejected or thrown
  queueing keeps the in-memory draft and old stored copy, reports a save issue,
  and tells the user to keep the page open. Acceptance still does not mean saved.
- Pending central status no longer claims local durability without proof.
- Profile > Storage health measures native localStorage size by fixed module
  label, aggregate recovery count and current-scope pending module markers.
  It only reads; it does not request persistence, create databases, export data,
  clear entries, sync edits or resolve reviews. It returns no raw keys, values,
  actor ids, clinical content, tokens or arbitrary error messages.
- UTF-16 size and whole-origin browser estimates are explicitly approximate;
  origin quota is not localStorage headroom. Missing information stays unknown.
  IndexedDB queues/archives are explicitly outside this measurement.
- Sessions explains queued conflict, blocked successor or legacy recovery copy.
  No automatic resolution, archive pruning or changed user choice semantics.

## Required next acceptance gates

| Gate | Required proof / remaining work |
| --- | --- |
| Actual storage pressure | Measure native per-module sizes on affected origin; independently inventory IndexedDB snapshots, unresolved rows and resolved archives with counts/bytes only. |
| Existing reviews | Classify actual queued versus legacy versions; distinguish no-op/bookkeeping differences from business edits; preserve all unresolved variants before any consolidation. |
| Medical at full cache | Prove explicit failure without false saved state, or a committed durable draft before promising offline survival; test localStorage and IndexedDB failure independently. |
| Crash boundary | Close during local transaction and while server acknowledgement is lost, not only after a successful local commit; retain text before blur. |
| Collaboration | Distinct users, independent fields, same-field review, multiple tabs, delayed/reordered replies, duplicate retries and tombstone preservation. |
| Identity | Logout, expired login, organization/team switch and revoked write permission while pending; never replay into another scope. |
| Upgrade/rollback | Old and new tabs, blocked database upgrade, schema compatibility and rollback with pending work preserved. |
| Offline promise | Separate temporary outage in an open page, reload, full browser restart and cold offline launch; verify supported browser/device combinations. |
| Growth and recovery | Bounded reloadable caches, byte-based snapshot budgets, measured large-data/queue performance, server restore drills that preserve newer work. Unresolved drafts must never expire by age alone. |

Prioritize Medical and Sessions, then evaluate each remaining module against the
same gates. Track verified/failed/unknown per module instead of a platform-wide
completion percentage. Candidate validation is not production verification.
A new direct Deploy safe command is required for this candidate.

## Validation

Full local QA passed 3,896 tests, with three pre-existing file-dependent skips.
The subsequent pending-status wording change and visible failure-report test are
validated separately before commit; exact-commit CI remains required.
Eleven focused Chromium recovery/diagnostic cases and eight WebKit cases passed.
An initial test used an obsolete profile-button selector; the corrected real UI
selector passed. A broader initial queue-return change failed recovery browser
regressions; it was narrowed to preserve guarded skips before the passing full QA.
No failing assertion was removed and no timeout or safety gate was relaxed.
