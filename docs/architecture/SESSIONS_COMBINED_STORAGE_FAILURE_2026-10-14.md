# Sessions combined storage-failure checkpoint — 14 October 2026

## Ownership, scope and decision

System / Security owns this saved-work reliability task and its release candidate.
Sessions is the affected module owner for the autosave-status boundary. Medical
owns its form/business rules; only an existing QA fixture clock is corrected.
The candidate continues `codex/sessions-restart-acceptance-20261012` from the
previously released `8f2333d58deee481c1fcff846931f8e84d4ab202` baseline. Live was
not reverified during this local checkpoint; no release is implied.

The preceding [crash checkpoint](SESSIONS_CRASH_ACCEPTANCE_2026-10-13.md)
exercised isolated saving modules. This checkpoint loads the full application,
real editor, autosave integration, IndexedDB journal and visible status indicator
with synthetic authentication and HTTP responses. Existing source data, write
contracts, receipt validation, permissions and conflict rules are preserved.

## Confirmed defects and corrections

Reproduction: edit Sessions while localStorage writes fail and the server rejects
saving; reload with a durable pending journal; restore server saving and trigger
the normal online event. The server accepts exactly one edit and the journal
becomes empty, but the UI remains **Sync issue**.

The autosave display filter requires a recent local edit or an unresolved visible
save. After reload there is no local edit timestamp. Reporting `issue` incorrectly
cleared the unresolved flag, so the subsequent verified `saved` notification was
ignored. The new full-app case and a focused module-contract test both failed
before correction, at the expected status assertion.

The filter now treats both surfaced `saving` and `issue` as unresolved until
`saved`. Key/workspace filtering and suppression of duplicate stale completion
notifications remain. The sync owner still validates scope, receipt and pending
work before emitting success; the display filter does not infer saving from a
cache write, empty UI or restored network connection. No storage or server code
is modified.

The stronger review-status assertion found a second defect: after reload an
unresolved review row can coexist with the default **Saved** indicator. A
separate run against the unchanged autosave runtime also failed this assertion,
confirming that it predates the first correction. The raw review row and dialog
content remain intact; the failure is misleading status, not review deletion.

The central retry/read path now checks existing review rows when no pending
operation remains, and reports **Local changes need review**. It checks the
current read scope and verified module baseline before and after the asynchronous
read. It does not enqueue, resend, resolve or mutate those review rows. Added
contract cases cover full/partial reads and a scope switch during the read.

## Full-app matrix

| Failure/recovery | Evidence required by the new test |
| --- | --- |
| localStorage quota + central POST 503, IndexedDB available | Exact pending row and editor text survive background hydration and reload; raw cache is absent; one accepted operation on recovery; queue clears and UI becomes Saved; another reload shows accepted text |
| localStorage quota + IndexedDB writes fail + central saving unavailable | Specific not-saved-on-device warning, no journal row and no outgoing write; text survives background hydration; a subsequent actual edit after local storage recovers creates the journal, still fails central saving, then syncs after online recovery |
| Existing conflicting review + both local write paths fail | Review is created by a real conflicting editor operation; later volatile title keeps its explicit not-saved warning through background hydration; reload loses that uncommitted title but preserves the exact review and accepted colleague content; review dialog still exposes the retained local variant and no synthetic server effect occurs |

An expected volatile-text loss in the third case is a documented limit, **not a
platform acceptance pass for durable recovery of that text**. No committed record
is deleted, reinjected or silently resolved to achieve the assertions.

Faults are deterministic injected `QuotaExceededError` at the Sessions cache and
shared IDB write boundary, plus HTTP 503 for saving. They do not fill the host disk,
exhaust the real browser quota, deny every API/read, or prove offline cold startup.
The synthetic backend uses the actual operation merge protocol and transport
decoder. It does not prove production database transactions or audit exactly-once
semantics. Other modules/origins are not universally certified by these cases.

## Test-fixture corrections during diagnosis

- The first cache probe accidentally used the app's patched getter and observed
  the in-memory projection. It now captures the native getter before app boot.
- The synthetic backend initially passed the encoded operation to the merge
  protocol. It now uses the same bounded transport decoder as the existing QA
  server before applying it. Neither correction alters product code.
- Dispatching `change` with identical field text is not a real retry action and
  correctly produces no new write. Recovery is explicitly tested with an actual
  subsequent edit; no dedicated Retry UX is claimed.
- The existing Medical real-form case used a fixed training date but the actual
  calendar clock. On 14 October it opened a day without scheduled training and
  correctly disabled the form. The fixture now fixes browser time to 9 October,
  matching its existing synthetic data; product date/clinical rules are unchanged.

## Validation

- `npm run qa:contracts`: **1,443 passed**, no skips, including the new
  autosave-boundary and scoped review-read cases.
- Chromium: **12 passed**, no skips — three new Sessions full-app cases,
  three existing Medical full-app cases, two delayed-receipt cases with/without
  cache quota, and four two-editor ordering cases.
- WebKit: the same **12 passed**, no skips. The three new cases are checked again
  after strengthening the background-hydration warning assertion.
- `npm run qa:static`: passed on the final runtime, including `npm run check`,
  storage, security, release and architecture guards. Existing size/readiness
  warnings remain; missing local authenticated QA credentials are not treated as
  deployed acceptance.
- Explicit new/helper JavaScript syntax and `git diff --check` checked before commit.

The initial broad contract run caught an extra asynchronous yield for old bridge
interfaces without Sessions review support. The optional review read now executes
only when that capability exists, preserving their existing execution ordering.
The owner-switch test double also now mirrors the real scoped store: after A
switches to B, a subsequent read for B cannot return A's review. Final assertions
still require no writes, unchanged manifest, and no stale-owner status.

```sh
npm run qa:contracts
npm run qa:static
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-full-app-storage.smoke.spec.mjs qa/medical-draft-recovery.smoke.spec.mjs qa/central-state-revision.smoke.spec.mjs --grep 'full Sessions app|full Medical app|Sessions consecutive edits|Sessions two-editor save ordering'
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-full-app-storage.smoke.spec.mjs qa/medical-draft-recovery.smoke.spec.mjs qa/central-state-revision.smoke.spec.mjs --grep 'full Sessions app|full Medical app|Sessions consecutive edits|Sessions two-editor save ordering'
```

Local logs: `/private/tmp/fs-full-storage-final-contracts.log`,
`/private/tmp/fs-full-storage-verified-chromium.log`,
`/private/tmp/fs-full-storage-final-webkit.log`,
`/private/tmp/fs-full-storage-verified-webkit.log`, and
`/private/tmp/fs-full-storage-verified-static.log`.
Remote exact-candidate CI and authenticated staging/live verification remain
separate; neither was run in this checkpoint.

## Remaining product gaps and next step

Must address before calling Sessions recovery complete: provide an explicit retry
and downloadable recovery path for the latest **memory-only** working generation,
with owner isolation and honest status. The current warning says to keep the page
open and retry; the inspected Sessions toolbar's Save action saves to Exercise
Library, not the Sessions journal. Re-entering identical text is not a retry.
Medical already has a separate recovery-copy workflow and must retain ownership
of its clinical rules.

Browser memory cannot survive a reload or crash when every durable path has
failed. A warning and any unload prompt can reduce accidental loss, but cannot
promise persistence or replace an exported copy. Recovery must not clear cache,
archive a review automatically, or label an unconfirmed draft saved. Review,
retry and export must distinguish the latest volatile work from older committed
pending/review rows and other accounts/teams.

Safe Lane release remains separate. This checkpoint is a local candidate with
local verification, not production acceptance, a full-platform certificate or
proof that every reported user storage incident is resolved.
