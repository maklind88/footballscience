# Saved browser copies: read-only product candidate, 4 November 2026

## Scope and ownership

Owner: System / Security. Shared entry point: Storage health. Affected boundaries:
Medical, Sessions and Exercise Library recovery confidentiality; their writes,
retries, merge rules and recovery data remain unchanged.

Branch: `codex/snapshot-history-review-20261104`, created from fetched
`origin/main` at `ddeb62175`. The earlier experimental grouping/export branches
are not part of this candidate. Root-checkout Video Analysis and database-health
changes are untouched. This candidate contains no grouped writer, cleanup,
migration, restore action or server/API/database change.

## Delivered behavior

An active signed-in `admin` can open **Storage health → Review saved browser
copies**. The view lists existing full snapshot rows, displays timestamps and
module content previews, and downloads one selected full copy as a review file.
Content is rendered as text, never HTML. Long previews are shortened explicitly;
the review file retains the complete selected envelope. Private Medical payloads
are not previewed in this shared view: it directs clinical review to Medical and
states that the administrator's full download contains medical information.
The existing permission matrix permits Medical export for the admin role; the
new entry point does not extend that export to club/team admins or coaches.

The view is intentionally restricted to the exact admin role, not the broader
`isAdmin()` group that also includes club/team admins. Whole snapshots can contain
private Medical data and settings from several modules. Local-development mode,
missing auth, inactive users and other roles do not receive this entry point.
Existing Library and Sessions recovery entry points remain available as before.

Every displayed/exported copy must have the current exact user/org/club/team/role
read scope and matching ownership for every storage entry and metadata entry.
Only the known full backup-v1 envelope is accepted. Unknown/grouped formats,
unknown payload keys, unscoped/foreign copies and separate recovery payloads stay
unmodified and are excluded with an explanation. No historical ownership is
inferred and no pending copy is adopted as a fresh edit.

This is not a guarantee that every old row is reviewable: a full snapshot with
one unverified component is excluded as a whole. The UI distinguishes verified
copies from other recovery copies that may still exist. It never reports that
excluded or unread data is absent or safe to delete.

## Read and export safety

- The new reader enumerates installed databases, opens the installed version and
  uses readonly transactions. If a database disappears during enumeration, its
  upgrade is aborted. No schema creation/repair or retention change is allowed.
- Unknown store key paths and read failures report unavailable, not empty.
- Reading is bounded by 100 rows, approximately 20 MiB of serialized UTF-16 data
  per page and timeouts. Next-page navigation retains older copies' accessibility
  without accumulating all history in the DOM. A row that fits on the next page
  is not skipped merely because the current page's byte budget was exhausted.
- A single row larger than the review limit is left stored and excluded from this
  review. The cursor still needs to materialize that row before measuring it;
  this is not an absolute browser heap or main-thread latency guarantee.
- Before download, the selected ID is read again and must still match the displayed
  full envelope. A changed, removed, unreadable or unauthorized copy is not exported.
- Every auth event invalidates the open view, even an A-to-B-to-A transition.
  Actions also recheck scope; a periodic check covers scope changes without an
  event. Closing the view clears its listeners/timer. Closing Storage health while
  its lazy import is pending cancels the later opening.
- Downloads use `football-science-snapshot-review-v1`, `purpose: review-only` and
  a versions array, with no legacy top-level storage/keys. The unchanged general
  backup importer rejects this file before confirmation or writes.
- An already-loaded view can read and download locally with network requests
  blocked. If its code cannot be loaded, Storage health stays open with a retry
  explanation. This does not certify cold offline startup or future OS eviction.

Local role/scope checks use the existing auth bridge. They are not a new
server-authoritative permission mechanism, and local files are not signed proof
of authorship. No central write endpoint or server-side permission is added.
Applying a reviewed copy must remain an explicit operation owned by its module,
with its existing server-side permissions and version-conflict checks.

## Validation

Repeatable targeted command:

```sh
QA_PORT=5183 npx playwright test --config=qa/playwright.snapshot-history.config.mjs
```

The suite includes the actual app/auth/Storage health path with synthetic remote
HTTP, plus isolated real IndexedDB tests and existing data-safety contracts.
It covers admin/coach/medical/club-admin/guest visibility, content confidentiality,
text rendering, exact download, old-importer rejection, changed/deleted rows,
account transitions, readonly transactions, bounded paging, unavailable storage,
unknown schemas, mobile width/focus, offline download and lazy-load cancellation.
No production clinical or coaching record is modified by these tests.

Final result: **157 passed, zero skipped, zero flaky, zero failed**, in 42.3
seconds: 73 contracts, 42 Chromium cases and 42 WebKit cases. The final suite also
verifies that Medical content is excluded from the shared preview while the
permitted admin download retains the exact full copy. `npm run check`, explicit
new-file syntax checks, `npm run security:platform`, `npm run architecture:budgets`
and whitespace validation passed. Local evidence is in
`/private/tmp/snapshot-history-candidate-20261104.log` and
`/private/tmp/snapshot-history-candidate-results-20261104.json`; the committed
suite is the repeatable source of evidence.
The full release gate/staging/production verification have not run; this is a
Safe Lane candidate awaiting a direct user deployment instruction.

During development, the full-app test initially counted an existing Transfer Room
startup POST as a new review write. The network trace identified its key; the test
now establishes the no-new-writes baseline after that known initialization.
Another fixture opened IndexedDB before the app had created its stores; seeding
now waits for a real committed app snapshot. Neither was labeled a fixed product
save defect. A genuine dialog width overflow on mobile was corrected with
border-box sizing. Review of byte-bounded paging also caught and fixed skipping
a copy that should move intact to the next page; both have regression tests.

Screenshots of the actual app view and mobile view were inspected. New styles
are scoped to this dialog and loaded only when the view opens.

## Remaining platform work

This candidate improves recovery visibility. It does not reduce stored bytes,
repair prior work, certify all modules or prove the cause of the affected user's
full browser. Snapshot grouping, broad retention changes, automatic recovery and
historical ownership conversion remain excluded. Diagnosis of the affected
profile and the wider saving/offline/concurrency acceptance program remain open.
