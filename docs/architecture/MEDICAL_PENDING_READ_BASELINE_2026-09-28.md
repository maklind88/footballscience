# Medical Pending Read Baseline

Owner: System / Security / Release (shared cache and hydration contract).
Consumers: Medical, Squad, Sessions. Their clinical rules, rendering, permissions,
server API and database schemas are unchanged.

## Reproduced Failure

A coach with read-only Medical access and a pending Medical disk snapshot could
successfully fetch revision 4 while still reading the old local snapshot.
Hydration advanced its metadata, but returned before applying the central value.
The regression first failed with an empty record list despite a central 75%
recommendation. All test data is synthetic.

## Contract

- Successful authorized Medical reads use an in-memory `central-readonly-baseline`
  when a pending snapshot cannot safely be written by the actor.
- Only local selection fields are carried into that view. Local clinical fields,
  plans, recommendations and media are not merged into the authorized response.
- The original native storage value and its manifest generation remain intact.
  A read is not a save acknowledgement. Backup/export still reads that original.
- Normal module reads use the view. Internal coach view normalization changes only
  the in-memory view; it does not claim local durability.
- Protected writes, remove and clear refuse to destroy this recovery copy. The
  read view cannot enter retry, direct queueing or empty-server seeding.
- Previously queued/in-flight responses cannot acknowledge the separated draft.
- The view is bound to the current actor/organization (when present)/club/team/role.
  Scope changes and sign-out do not expose the old view or fall back to the draft.
  Hydration checks its initiating context after asynchronous reads/projection.
- Older verified revisions cannot regress this view. Missing revision evidence
  fails the read. A successful snapshot omitting the key clears the visible view,
  not the recoverable draft.
- A role change alone does not adopt the separated recovery copy as a new edit.
  Pending recovery remains explicit; this change does not build a Medical journal
  or a new recovery UI. A fresh runtime continues through the existing access and
  Medical pending-recovery rules.

## Verification

The browser regression covers initial read, the real Medical state reader's
participation value, reload, exact recovery payload/generation, a newer revision,
a delayed older revision, missing revision evidence, omitted/empty snapshots,
no Medical POST/seed, and sign-out. A deferred-read regression covers sign-out
between request and response.

Storage contracts cover quota-safe view normalization, original backup content,
write/remove/clear rejection without partial mutation, and unchanged queue state.
Sync contracts cover automatic retry after an access change plus an older
in-flight 200, 403, 409 and network failure after the view is installed.

Existing central-state, Medical editor, Sessions journal, storage, API and module
contracts remain required. This is not proof that every reported production
visibility issue has the same cause.

Initial candidate verification: 3,020 passing tests (2,976 API/contracts,
34 central-state browser cases, 10 Medical clinical browser cases).
Both new browser regressions also passed 10 repetitions each (20/20) on the
initial candidate.
`npm run qa:static` passed, including syntax, release rules, incident-readiness,
storage, input-save policy, platform security, migration checks and size budgets.
Existing architecture/performance warnings and missing local deployment/QA
credentials remain; these development checks do not authorize or certify Live.

## PR Review Follow-Up

Review reproduced a conflict-path gap: after a 409, successful hydration could
install the read-only view, yet the flush continuation still changed the draft's
manifest revision and cleared pending without a write acknowledgement. The flush
now checks the separated view after conflict retry and hydration, before any
acknowledgement or manifest mutation. Two service regressions cover these paths.

Three additional regressions reproduced stale hydration completion after
sign-out during apply, empty-snapshot client initialization, or the seed response.
Hydration now revalidates its read context at those continuation boundaries and
before successful completion/error publication. Required recovery writeback also
revalidates before continuing hydration bookkeeping.

The follow-up code passed 3,025 tests (2,981 API/contracts, 34 central-state
browser cases and 10 Medical clinical browser cases) and `npm run qa:static`.
Seven targeted regression cases passed ten repetitions each (70/70).

### Open Review Blockers

The automated GitHub review of f73b0353 identified three additional P1 findings.
This candidate is not ready for merge or deployment despite green initial CI:

- Backup import reaches `rawSetItem`, which diverts a separated Medical view to
  memory while the importer reports restoration and reloads. Restore must reject
  the entire affected import before mutation or preserve a durable imported
  generation; it must not report memory-only restoration as success.
- A role promotion or new Medical editor on the same page inherits the read-only
  marker. Enabling edits requires a writable authorized baseline while preserving
  the old pending recovery copy separately, never automatically adopting it.
- Token rotation discards the in-flight read, but a concurrent post-auth hydration
  can return early while it is still active. The fresh request needs a bounded
  drain after the active hydration terminates, with no stale-principal apply.

These require regression-backed corrections and a fresh exact-commit CI/review.

## Remaining Platform Work

Partial batch-failure isolation, freshness diagnostics, cross-device offline
journals and additional module integrations are separate steps. No production
data was inspected or changed for this fix. Deployment requires a new explicit
user command and the normal Safe Lane.
