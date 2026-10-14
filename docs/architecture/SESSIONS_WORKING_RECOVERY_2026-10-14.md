# Sessions memory-only recovery — 14 October 2026

## Decision and ownership

System / Security owns this bounded saved-work reliability candidate. Sessions is
its affected module owner. It continues `codex/sessions-restart-acceptance-20261012`
after `7f43430fe688b44a35dedc28ef4cc9db81deb836`. No staging, production, database,
release-policy or clinical-rule changes are part of this checkpoint.

The [combined-failure checkpoint](SESSIONS_COMBINED_STORAGE_FAILURE_2026-10-14.md)
proved that the editor can retain work in memory when cache and journal writes
both fail, but the user had no explicit retry or download. Editing identical text
is not a retry. Clearing cache would not fix the missing recovery boundary.

Use the existing Review local saves dialog and existing journal/conflict flow.
A separate memory section is mounted before asynchronous review reads; it remains
usable if those reads or central refresh fail. Code and CSS load with Sessions,
so first opening after network loss does not depend on fetching a new module. Central accepted state remains the
shared source of truth. The working copy is uncommitted user intent, not a receipt.

## Behavior and safeguards

- The save client retains the exact latest serialized working value and preceding
  editor value, generation token and observed revision. One full snapshot per read
  owner replaces the previous snapshot; it does not accumulate one per keystroke.
- Memory lookup uses the existing central read owner (account, organization, club,
  team, role and token presence), plus the existing stable journal scope. The
  journal scope itself is unchanged. The bridge also requires current write
  access. An account-change event closes the dialog; every action rechecks access
  and the displayed generation. A stale control cannot select another copy.
- Retry reuses the original draft token and the client's retained edit baseline,
  including after a colleague's accepted refresh. It uses the existing serialized
  local journal commit, replay, conflict and receipt checks. There is no force
  overwrite, automatic review resolution or new server endpoint.
- An older local commit only retires its matching memory generation. A later
  generation remains available. Existing pending/review rows remain separate.
- Download reads synchronously from memory without storage/network dependencies,
  queue mutation, acknowledgement or review archival. JSON includes schema,
  export timestamp, exact value, previous value and owner/generation metadata.
  Text preview uses textContent, not HTML. Object URLs are revoked after use.
- A denied localStorage read cannot prevent opening the memory panel. Without
  that read, legacy review completion cannot acknowledge an unobserved cache.
- Download remains enabled during a stalled retry. If the generation changes,
  the UI first presents the latest copy and requires a new action. A download
  request does not claim that a file was successfully written to disk.
- The UI distinguishes unsaved memory, a successful local journal commit and
  central sync/review. Normal completion is still confirmed by the existing
  central saving owner, not by the download or retry button.

## Acceptance cases

| Boundary | Required evidence |
| --- | --- |
| Repeated cache + journal write failure and rejected central saving | Latest B is exported exactly, no server effect or journal row; failed explicit retry preserves B; retry of unchanged text after local recovery commits once; later central recovery accepts once and status becomes Saved |
| Peer refresh before retry | Export remains available even when durable review reads fail; retry retains original baseline and becomes review; accepted peer content is unchanged |
| Older retained review plus newer volatile edit | Export contains latest memory work; retry adds its own durable operation without modifying or resolving the exact older review |
| Owner/access change | Other account/org/team/role/logout cannot read the copy; returning rightful owner can; user-change closes dialog and stale controls cannot export or retry |
| Older completion / newer work | Old local commit cannot retire B; async UI retry completion rereads B and keeps it downloadable |
| Stalled local retry | Current work can be downloaded while retry awaits indefinitely; later generation requires renewed action and then exports exactly |
| First opening offline | Every network request is aborted and browser context is offline before opening; Sessions cache reads are denied; actual styled dialog and exact download still work without a journal or server effect |
| Layout | Full editor recovery tested at desktop and 390px; no horizontal dialog overflow; downloaded JSON inspected in actual Chromium and WebKit |

The client cases use a controlled store. Browser cases use the full app, real
IndexedDB and native downloads with synthetic auth/HTTP. The stalled-retry and
access-control panel cases use the real dialog with controlled asynchronous
callbacks. These do not establish production transactions or actual host-disk
exhaustion. All data is synthetic.

## Issues found while extending acceptance

The full-app mobile click test reproduced the fixed navigation covering the
existing Review local saves button. Scoped mobile margin/scroll-margin now leaves
room above navigation and the save notice. The test still uses an ordinary click;
it does not force clicks or hide the navigation. WebKit's install-app prompt also
intercepted fixture navigation; the mobile test now seeds the normal dismissed
preference, without changing product installation behavior.

Inspection of the first-offline-open boundary found that the dialog was lazily
imported and its CSS was first requested on opening. Sessions now imports its
recovery dialog with the runtime and preloads the small stylesheet through its
existing stylesheet. A separate network-blocked browser case covers this boundary.
The opening path also tolerates a denied cache read; legacy completion remains
fail-closed if that original cache value could not be observed.

## Validation

- `npm run qa:contracts`: **1,443 passed**, no skips. Final run includes the
  eagerly imported dialog; no existing contract assertion was relaxed.
- Targeted client/runtime/replay contracts: **45 passed**, no skips, including
  **eight new** working-copy cases. Rechecked after the denied-cache-read guard.
- Final new browser suite: **seven passed in Chromium and seven in WebKit**, no
  skips. This includes real mobile entry, blocked network plus denied cache read,
  native JSON downloads, failed/successful retry, peer conflict, older review,
  owner revocation, newer generation and stalled retry boundaries.
- Existing combined-storage and durable-review browser cases: **17 passed in
  Chromium and 17 in WebKit** alongside the first five recovery cases. The new
  seven-case suite was rerun after the subsequent UI/offline corrections.
- Existing restart/version boundaries: **eight passed in each browser**. Five
  additional Chromium process-crash cases passed. In the combined run containing
  these cases, the new mobile case initially failed for the documented entry/
  install-prompt causes; it passes in the final recovery suite above.
- `npm run qa:static`: passed, including syntax, storage/platform/security/release
  guards, performance and architecture budgets. Existing repository size and
  readiness warnings remain. Explicit final changed/new JS syntax and
  `git diff --check` passed. New runtime service stays below 500 lines.
- Desktop and 390px screenshots inspected; mobile dialog has no horizontal
  overflow. Screenshots and test logs are local diagnostic artifacts, not CI or
  production evidence.

Broad and targeted contract counts overlap and must not be added as unique
coverage. No authenticated staging/live acceptance ran in this checkpoint.

Reproduction commands:

```sh
npm run qa:contracts
npm run qa:static
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/session-working-copy.api.spec.mjs qa/session-planner-runtime-state-service-contract.api.spec.mjs qa/session-replay-coalescing.api.spec.mjs
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-working-recovery.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-working-recovery.smoke.spec.mjs
```

Final logs: `/private/tmp/fs-session-working-final-contracts.log`,
`/private/tmp/fs-session-working-verified-api.log`,
`/private/tmp/fs-session-working-verified-chromium.log`,
`/private/tmp/fs-session-working-verified-webkit.log`, and
`/private/tmp/fs-session-working-verified-static.log`.

## Limits and next step

This is a local candidate, not production acceptance. A volatile copy can still be
lost on tab closure, reload, browser crash or power loss if the user has neither
saved nor downloaded it. The download is a recovery artifact, not automatic
central restoration; this checkpoint adds no file import/apply UI. Any later
import must preview changes and revalidate current ownership, permissions and
conflicts rather than upload the full snapshot over current central work.

Safe Lane release and authenticated exact-candidate verification remain separate.
The broader per-module saved-work matrix remains open; this checkpoint does not
certify Medical, every offline startup path, every browser or all reported cache
incidents. No cache clearing or deletion is needed for this recovery flow.
