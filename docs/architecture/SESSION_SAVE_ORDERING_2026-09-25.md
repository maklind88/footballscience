# Sessions Save Ordering Verification

## Decision And Scope

The user confirmed: the latest correctly server-acknowledged edit is authoritative.
This is not arrival-time or device-clock last-write-wins. An edit based on that
accepted version may replace the same field. An obsolete offline edit must not
overwrite a newer accepted field simply because it arrives later. Compatible
edits to different fields must preserve both contributors' work.

System/Security owns this verification of the Sessions save boundary. Sessions
retains training/block semantics. No other module, migration, release, real
training, or existing user review queue is changed here.

Worktree: `/private/tmp/footballscience-session-save-quota-investigation`.
Branch: `codex/session-save-quota-investigation-20260925`.
Product-fix baseline: `8940feff51049438dfe8d3c1dd3cd5e7f51c538e`, based on
`07e5ef0067e8165e2f88daf8c17a7ae145d4c47a`.

## Current Architecture And Failure Boundaries

The existing client records immutable date changes in IndexedDB and returns
conflicting changes for review. It is not necessary to replace this journal or
introduce a second generic save framework to enforce the decision above.

The baseline fixes two separately reproduced integration defects:

- Missing legacy `fieldUpdatedAt` maps versus normalized empty maps could create
  false conflicts. The fix merges bookkeeping without resolving real field
  conflicts or weakening authorization.
- Reading a Sessions view could persist normalized defaults during receipt
  rendering, invalidating the current write generation. Reading now normalizes
  the returned view without rewriting the acknowledged cache.

These fixes are not proof of the first observed Live conflict's exact cause.
Previously retained review copies must not be discarded or auto-resolved.

## Permanent Regression Matrix

The new tests live in files already selected by canonical API/browser QA.
No assertions, budgets, permission rules, or test retries were weakened.

| Invariant | Evidence |
| --- | --- |
| A user reads A's accepted value and intentionally saves B; B wins | Two real editor/browser contexts; server, cache, pending flag, Saved indicator and reload assertions |
| Two users edit independent fields from the same base; both survive | Shared revision-CAS server, actual 409/retry, merged server/cache and reload assertions |
| A stale same-field edit cannot overwrite the accepted value | Real editor conflict, immutable review row and pending flag, review survives reload |
| A late receipt cannot restore an older version after B is accepted and observed | Deferred A receipt, B's independent editor save, A fresh hydration, then release A's receipt; B remains in UI/cache and after reload |
| Device-clock skew does not determine which content wins | Production merge-protocol test and actual API-handler POST/GET/POST with decreasing client timestamps |
| Supplying a current revision cannot legitimize an obsolete command | Actual API handler rejects stale original command with 409 and leaves stored record unchanged |

Browser tests use real product UI, storage wrappers, IndexedDB and sync code, with
synthetic auth and a shared backend enforcing revision checks and the production
merge function. API tests execute `api/app-state.js` with synthetic downstream
storage. They do not validate real Supabase auth/RLS or production infrastructure.
The late-receipt test triggers the existing hydration API explicitly; it does not
prove realtime propagation to idle clients without a refresh.

## Verification Status

| Check | Result |
| --- | --- |
| Four two-editor scenarios repeated ten times, Chromium | 40/40 passed |
| API handler, Sessions protocol/runtime/drafts, central-sync and data-safety selection | 219/219 passed |
| Combined Chromium saving/offline/recovery selection | 54/54 passed |
| WebKit saving/offline selection | 49/49 passed |
| Existing Chromium quiet draft, save feedback and view-only navigation cases | 3/3 passed |
| Syntax, release rules, storage, text input policy, platform security and architecture guards | Passed |

Architecture reports its existing 83 oversized module files; budgets were not
raised. The tests above are targeted, not a complete repository QA or Live gate.
No release is authorized by this document.

The refreshed remote main `d5bc7ee31b4047645046cdc4292b9bf597ca2ba6` adds only
release attribution; its file tree is identical to the tested parent baseline.
No unrelated module changes are part of this candidate.

Reproduce the repeated ordering test:

```sh
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/central-state-revision.smoke.spec.mjs --grep 'Sessions two-editor save ordering' --repeat-each=10
npx playwright test --config=qa/playwright.save-webkit.config.mjs --project=save-webkit
```

WebKit coverage is not a physical iPad test. No deployment, production-account
test, remote schema change, automatic conflict resolution, or full-repository
CI run was performed in this checkpoint.

## Remaining Long-Term Work, In Order

1. Finish combined verification of this candidate, including offline restart,
   quota/storage failures, draft interaction and WebKit. Only then request the
   separately authorized Safe Lane and synthetic authenticated postdeploy proof.
2. Investigate the retained Live conflicts without clearing browser storage or
   declaring unresolved work saved. Preserve the original copies and distinguish
   real content conflicts from representation-only differences.
3. Close real-backend receipt/retry coverage: a lost response after commit must
   not duplicate audit/side effects. The offline HTTP fixture's receipt map is
   not evidence of a durable server idempotency ledger in production.
4. Measure queue-to-ack time and server phases using content-free diagnostics.
   Distinguish auth, permission, storage capacity, network and genuine conflict
   recovery. Establish performance thresholds from measured workloads.
5. Reduce the full-calendar persistence path only through the existing reviewed
   domain-record plan: verified backup/restore, identity/library dependencies,
   count/hash comparison, read-back/shadow proof and reversible cutover. Do not
   flip a database mode or start a migration from this QA checkpoint.
6. Apply the invariants to each module's actual save boundary, preserving its
   permissions and business rules. The generic offline journal remains distinct
   from proven module integration; whole-platform/Desktop offline is not certified.

This checkpoint is deliberately not a claim that network failures disappear,
that all modules use the same persistence path, or that the entire reliability
program is complete. Failures must preserve work and expose an actionable state,
not be hidden by increasing timeouts, removing conflict checks, or clearing queues.
