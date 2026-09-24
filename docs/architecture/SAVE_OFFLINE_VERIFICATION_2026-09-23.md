# Save and offline verification, 2026-09-23

## Latest-main rebase verification

Updated the isolated `codex/save-offline-verification-20260923` candidate onto
`778f55fa7271040eebe6789a038a317da108ac93`, confirmed against GitHub again after
testing. The two incoming commits contain IDP background-refresh changes and an
empty Home release marker. No storage-file conflicts occurred.

`git range-diff 87707234..f6739f05 origin/main..HEAD` confirmed both original
candidate patches were unchanged by rebase. Their new commits are `e42bb407`
and `857141e51d87c07398167cba3a358a4d47df72ad`; the latter is the tested HEAD.
The candidate still changes only the nine intended storage, QA and report files.

Post-rebase checks, all terminally successful:

- `npm run qa:static`: passed, including check, release rules, storage and
  input-save policy, security, migration lint, performance and architecture.
- Targeted API contracts: **142 passed**, zero failures/skips. Files cover
  browser cleanup, central sync/facade, data-safety contracts/runtime, Sessions
  durable saving/text drafts, and IDP background-refresh/module contracts.
- Targeted Chromium: **43 passed**, zero failures/skips/retries. Full files:
  `central-state-revision`, `local-database-compatibility`,
  `save-offline-recovery`, `offline-operation-journal`, `session-save-storage`,
  and `idp-background-refresh` (all `.smoke.spec.mjs` under `qa/`).
- `git diff origin/main...HEAD --check`: passed.

Playwright used the canonical local config, one worker and `--max-failures=1`;
the limit did not truncate either run. Coverage includes real IndexedDB upgrade,
quota/abort recovery, two-tab preservation, full browser restart, synthetic HTTP
revision-CAS conflicts, central hydration, and IDP desktop/mobile refresh.
The previous full-suite results below remain historical evidence on the earlier
base; this rebase used a risk-focused regression matrix, not another full suite.

Logs: `/private/tmp/footballscience-save-rebase-static.log`,
`/private/tmp/footballscience-save-rebase-api.log`, and
`/private/tmp/footballscience-save-rebase-browser.log`.

No additional product changes, push, merge, staging, deployment or database
mutation. This is local candidate verification, not production verification.
Additional modules' offline journal integration remains disabled/unwired.

## Combined QA closure

The local candidate was rebased without conflicts onto
`87707234a37472ccf8cce1bf64d18e57c384398c`, producing compatibility-fix commit
`7644a806d8049153b389378cb8673a3ac3b275ff`. The combined verification below
includes the additional test-cleanup correction described here. It supersedes
the earlier unstable-run results, without erasing that history.

`closeCentralStateContext` previously raced context/trace closure against a
2.5-second timer and suppressed some trace errors. A deterministic reproduction
confirmed that it returned while close was still pending. It now awaits the real
close promise and propagates errors. Two API regressions prove delayed closure
is awaited and missing trace files are not hidden. No product code, assertions,
test timeouts, retries, permission rules or budgets changed in this QA step.

Canonical QA phases ran sequentially on the isolated candidate:

| Command | Terminal result |
| --- | --- |
| `npm run qa:static` | Passed |
| `npm run qa:api` | 2,827 passed, 11.0 minutes |
| `npm run qa:browser -- --max-failures=1` | 364 passed, 3 skipped, 22.3 minutes |

Total: **3,191 passed, 3 existing opt-in tests skipped, zero failures**.
The browser suite completed without retries, including all 25 central-state
tests and the real IndexedDB compatibility/restart tests. The fail-fast limit
did not truncate the run. API and browser projects are the two projects run by
the canonical `qa:playwright` phase; no npm pre/post hooks were omitted.

The existing skips are one Scouting Excel acceptance test requiring
`SCOUTING_IMPORT_FIXTURE` and two private match-video tests requiring
`FS_PLAYER_REVIEW_SOURCE`. Those files were not supplied; the skip conditions
were not changed. No real coaching content was used. Static platform readiness
also reports absent deployment/live-QA environment variables in this isolated
worktree; local QA is not proof of production readiness or Live verification.

Local logs:
- `/private/tmp/footballscience-save-qa-api.log`
- `/private/tmp/footballscience-save-qa-browser.log`

During the long verification, remote main advanced with IDP background-refresh
work and a Home release marker to observed `778f55fa`. The tested candidate was
deliberately kept at its verified base instead of changing code during QA.
Before merge/release it must be updated and verified against that newer main.
No push, PR creation, main integration, database mutation or deployment was
performed. Offline support for additional modules remains disabled/unwired.

## Follow-up: compatibility correction

The user authorized fixing the confirmed version collision, not deployment or
enabling additional offline modules. The original audit below is historical.

System/Security owns this correction. Sessions durable storage and local backup
storage are affected consumers; their data formats and save semantics are not
changed. The four product files are the shared connection helper and those
three consumers (journal, Sessions store, data-safety runtime).

The correction keeps the existing database and records in place. The common
connection helper opens the installed version for Sessions/backup readers and
leaves the additive v2 upgrade with the journal. Readers validate their required
store names/key paths. Version-change events close cached connections, allowing
the next operation to reopen them. Failed opens are retryable. A blocked upgrade
rejects with an explicit close-other-tabs message; its late upgrade is aborted,
so a rejected operation does not silently change the database afterwards.

This avoids moving pending records to a new database, abandoning any old journal,
or requiring all readers to upgrade on ordinary use. No database deletion,
destructive migration, automatic queue replay, UI save-boundary change, or server
permission change was added.

Compatibility coverage uses real shared-origin pages, both initialization orders,
byte-equivalent pending/snapshot records across upgrade and reload, an old v1
connection with no versionchange handler, aborted upgrade, synthetic quota error
on a real transaction, and unknown schema rejection. The full-browser-restart
test now upgrades to v2 while a committed Sessions edit is pending, and proves
both that edit and a separate journal operation survive browser restart.

An already-open old release cannot be retroactively fixed: if it blocks an
upgrade it must be closed/reloaded. Do not enable the generic journal before the
compatible readers have shipped. Downgrading to the old v1-only code after v2
activation is unsafe; never delete browser data to work around it.

The generic journal remains unwired. This correction alone does not certify
full-platform or Desktop offline support. No production deployment is included.

### Follow-up verification results

- Final storage/browser group: **16/16 passed**, including the original failing
  compatibility regression and denied-access recovery.
- Final API/service/facade/draft contracts: **78/78 passed**.
- `npm run check`, `security:platform`, `storage:guard`, `release:rules`,
  `architecture:budgets`, new helper/test syntax, and diff whitespace checks passed.
  The architecture guard still reports existing oversized-module warnings; no
  budget was increased.
- The broader browser run finished **40/43 passed**. The large compressed Sessions
  save exceeded its unchanged 10-second assertion; two other cases failed in
  Playwright tracing setup (`Tracing is already stopping`). A separate retry
  passed the large save and pending-Sessions case, then Periodization failed at
  test start (`Target page, context or browser has been closed`). Periodization
  passed when run alone. The large-save case also passed in a clean, unmodified
  `d432a193` comparison worktree. This establishes passing isolated regressions,
  not a green aggregate run or proof of the timing failure's root cause.
- No assertions/timeouts were weakened. Full repository QA, exact-SHA CI,
  production verification and non-Chromium coverage were not performed here.

The correction is retained as a local commit, not pushed or deployed. Before
release, obtain a stable combined QA/CI result; do not treat isolated retries as
a replacement for the release gate. Further offline-module integration remains
separate work.

## Scope and release status

PR #234 merged without deployment at commit
`d432a19331e2b734ef090b49a7c507858196bbcf`. This is the tested base.
No release command, staging push, database mutation or production deployment was
performed during this verification. Merge status does not establish Live parity.

Worktree: `/private/tmp/footballscience-save-offline-verification`.
Branch: `codex/save-offline-verification-20260923`.
During the original read-only verification, only this report and
`qa/save-offline-recovery.smoke.spec.mjs` were added locally.
Product code and the shared root worktree were not changed. The failing
regression is intentionally retained; this is not a release-ready candidate.

## Original audit evidence (before correction)

| Verification | Result |
| --- | --- |
| Text input policy, Sessions draft/durable-save, central-sync and data-safety API/service contracts | 75 passed |
| Central-state revision and Sessions recovery browser tests | 28 passed |
| Periodization and Sessions input, draft, save feedback and reload UI tests | 5 passed |
| New offline/restart/concurrent-edit tests plus existing storage and offline-journal browser tests | 8 passed, 1 failed |
| `node scripts/verify-text-input-save-policy.mjs` | Passed |
| New test file syntax and `git diff --check` | Passed |

Total across these distinct test groups: 116 passed, 1 failed. This is targeted
verification, not the full repository QA suite.

The new passing tests use actual Chromium IndexedDB, the production Sessions
save client/store/merge protocol, and a synthetic local HTTP server enforcing
revision CAS and idempotent receipts. They establish:

- A committed edit made while offline survives closing and reopening the entire
  persistent browser context, then replays exactly once on reconnection.
- Another principal cannot drain that edit through the client store scope.
- Two independent browser contexts starting from the same revision preserve edits
  to different fields through an HTTP 409 and retry.
- A same-field conflict preserves the first server value and retains the second
  user's edit for review, including after reload.

These tests do not exercise real Supabase authorization, an offline app shell,
Desktop packaging, or every module's end-to-end integration. The two-user tests
deterministically sequence competing writes from a common stale revision; they
are not a stress or network-interleaving test.

## Original confirmed integration blocker

`src/core/offline-operation-journal.mjs` opens the default
`football-science-data-safety-v1` IndexedDB database at version 2.
`src/modules/session-planner/session-save-store.mjs` and
`src/core/data-safety-runtime-service.mjs` still open that database at version 1.

The new compatibility regression opens the default generic journal, persists a
synthetic operation, closes it, then opens the Sessions store. The Sessions read
throws `VersionError` instead of returning an empty list. This was reproduced
twice. Existing generic-journal coverage uses a custom database name and does
not expose the collision.

This is a blocker before activating the shared journal, not evidence that Live
has already lost data: source inspection found no production consumer of
`createOfflineOperationJournal` beyond its definition/export. The test directly
activates the factory. No real browser profile or coaching data was used.

## Remaining boundaries

The generic journal exists but is not connected to module enqueue/replay flows.
Quiet text drafts backed by sessionStorage are not equivalent to a durable
committed operation journal. Reload recovery alone does not prove survival after
closing the entire app. Full-platform offline readiness is therefore unverified.

Before wider offline adoption, explicitly verify user/organization/team scoping
for every draft and queued operation. Some current draft scope providers use
only user ID; this observation is not an end-to-end cross-tenant leak finding.

## Original recommended next order

1. Fix database compatibility before enabling the generic journal. Prefer an
   independently versioned journal database unless a coordinated shared-schema
   upgrade is demonstrably safer. Preserve any existing queued operations;
   changing a database name without a recovery/migration decision is insufficient.
2. Turn the failing regression green and test existing data, both initialization
   orders, old/new tabs, blocked upgrades, quota failure and browser restart.
3. Connect one module at a time through explicit scoped, idempotent operations
   with revision checks, conflict review and acknowledgement-bound deletion.
4. Verify offline startup/reconnect/closed-app recovery in the Desktop context,
   including permission changes, account/team changes and concurrent users.
5. Run the required combined QA and independent review before requesting a
   release. No deployment is authorized by this report.
