# Cache pressure: measured storage and acknowledged read visibility

Task owner: System / Security. Candidate branch:
`codex/acknowledged-cache-pressure-20261104`, originally based on production
`066443400`, now updated to integrated main `009c792fc`.
Affected consumers: shared central save acknowledgements (Home, Schedule,
Periodization, Presentation, Medical and Sessions). Module business rules,
permissions, API writes and recovery ownership do not change. The Schedule correction is now inherited from main; this candidate adds no
Schedule-owned implementation changes.
The root checkout's Video Analysis/database-health changes are excluded.

## Actual browser observation

Read through the deployed Storage health UI in the connected Chrome profile,
4 November local time (5 November UTC). A separate diagnosis tab preserved the
Schedule specialist's active tab. No cleanup, restore or payload export was used.
Opening the application can trigger its normal startup activity; the observation
is a point-in-time profile measurement, not a frozen incident recording.

| Surface | Observation |
| --- | --- |
| Native localStorage | About 8.15 MiB estimated UTF-16, 34 entries |
| Legacy Library primary / backup | About 2.53 MiB each; 49 matching exercise payloads |
| Player Profiles | About 1.38 MiB estimated UTF-16 |
| Origin estimate | About 81.54 MiB used / 10,321.54 MiB quota |
| Persistence | Granted |
| Current-scope pending markers | 1; not an edit count or durability proof |
| Safety/Sessions IndexedDB | 149 rows; 21 inspected before the size bound, about 104.27 MiB serialized UTF-16 inspected |
| Inspected safety history | 11 rows, about 93.98 MiB serialized UTF-16 |
| Library IndexedDB | 5 rows, about 6.95 MiB serialized UTF-16; includes a retained recovery original |
| Medical recovery database | Not present in this profile at inspection |

Serialized UTF-16 estimates are not physical disk usage and must not be added to
the browser origin estimate. The partial scan is not a complete inventory.
No write-to-quota probe was run on the user's profile. The observation does not
prove a current quota exception, identify the cause of every earlier incident,
or make matching legacy copies safe to delete. The profile banner separately
reported a stale Home central version; that is not evidence of a quota failure.

The deployed Library bridge already routes new supported Library work through
IndexedDB. Its native compatibility copies remain. Therefore simply repeating
"move Library to IndexedDB" is not a new fix, and snapshot compression alone
cannot release localStorage capacity. Web Storage has a separate constrained
storage model; the origin quota and persistence flag do not grant more native
localStorage capacity. See [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Reproduced defect and narrow correction

The shared central runtime had an acknowledged-cache fallback only for Sessions.
For another key, an accepted server merge larger than its native cache could
throw on the cache write and never reach the view-refresh callback. A central
save could therefore succeed while the consuming read view retained older work.

The regression connects the actual data-safety and central-sync services to a
synthetic storage/server boundary. Before the change, five non-Sessions cases
failed the view assertion; the existing Sessions case passed.

All shared accepted acknowledgements now use the existing acknowledged-cache
helper. On quota failure it retains the prior native bytes and supplies the
accepted value as server-backed, nondurable memory. It neither submits another
write nor clears data. Security failures and a refusing bridge remain explicit
cache-refresh issues. Unaccepted replies, newer generations and changed accounts
must not install this fallback.

When the accepted view is memory-only, the runtime preserves the native copy's
hash, size and timestamp instead of relabeling old bytes with the new view's
metadata. The existing receipt path still records its server revision and clears
only the acknowledged pending generation. Snapshot capture reads native bytes,
so this distinction also protects backup interpretation.

This is a shared visibility correction, not new offline persistence. A new edit
that cannot be stored before submission still needs its module-owned journal or
an explicit online-only save path. A memory-only accepted view requires a central
read after a cold reload; it does not acquire offline availability from this fix.

## Validation and release status

- Before the shared change: five non-Sessions quota regressions failed; the
  existing Sessions path passed. After the change all six passed.
- Expanded isolated-candidate coverage: **279 passed**, including shared
  contracts, real native-quota pressure in Chromium/WebKit, and existing Medical,
  Sessions and save-status browser flows. This run preceded the additional
  full-application Schedule test below; it is not an all-green final gate.
- `npm run qa:static` and `git diff --check` passed. Existing architecture-size
  warnings remain; no new architecture exemption was introduced.
- The additional full-app test exposed a separate existing Schedule reader
  defect on base `066443400`: `readScheduleState()` successfully reads accepted
  data, then a normalization cache write throws and the outer catch returns
  default state. The test keeps this failure visible; it is not skipped.
- The active Schedule owner's committed candidate `59899b80a` already isolates
  that cache failure from the read result. A **temporary, detached QA copy** of
  that commit plus this shared patch passed the new full-app case in both
  Chromium and WebKit (**2 passed**) and the shared contract suite (**233
  passed**). This is compatibility evidence, not integration or release.
- The full-app fixture uses the actual initialized Schedule shape to avoid an
  unrelated startup-import successor during acknowledgement. Equivalent server
  JSON field ordering exercises normalization. It verifies the protected writer,
  explicit production reload consumer, visible merged training and cold online
  reload; it does not certify every editor's automatic view refresh.

Before the integration check below, the candidate was **local and uncommitted**,
not pushed or deployed. Its additional
full-app acceptance depends on the Schedule owner's reader correction reaching
`main`. Do not copy that owner's product changes into this candidate or release
the temporary combined QA tree. Once the independent correction is integrated,
rebase the isolated cache candidate and rerun its complete acceptance config and
static checks before committing/releasing. The current failure blocks readiness;
the 279 earlier passes do not override it.
The initial implementation instruction did not authorize release. The user has
since directly authorized this candidate with Deploy fast and an explicit request
to deploy after approval. The data/sync change requires the official Safe Lane;
authorization does not override failed validation.

## Follow-up verification — 5 November 2026 (America/New_York)

A fresh `git fetch origin main` still resolved `origin/main` and `FETCH_HEAD`
to `066443400b1a0b72f4f80ca8442b991fe63312f3`, identical to this candidate's
base. The ancestor check for Schedule commit
`59899b80a67e342a3d4d52e52ce44a0a5f25759b` returned false (exit 1).
The fetched main reader still returns default Schedule data when its cache
normalization write fails. The Schedule owner's chat remained active and reported
a Storage health release-test blocker; that status is informational only.

A new targeted run against this exact latest-main base plus the unchanged cache
patch produced **15 passed / 2 failed** (32.5 seconds): all 13 acknowledgement
contract cases and real native-quota pressure in both Chromium and WebKit passed;
the full-app Schedule read case failed in both browsers at the visible merged
training assertion. This confirms the previously identified integration dependency.
`git diff --check` passed. No rebase was necessary because main has not advanced.

No production code was changed in this follow-up; only this evidence was added.
The candidate remains local, uncommitted, unpushed and undeployed. Final acceptance
must wait for the Schedule correction to be integrated, followed by the complete
candidate suite on that new exact main SHA. Earlier combined-QA passes do not
establish that the correction is in main or Live.

## Integration verification — 5 November 2026, after 09:19 EST

`origin/main` advanced to `009c792fccda564b3d7764e530d78e3f9252f5d7`.
The ancestry check for `59899b80a` passed, and the reader's guarded cache write
was inspected. The isolated candidate branch was fast-forwarded to that exact
main SHA after preserving its six files in stash
`8eadd0edc7bfdeceb10a1565dbdeafe6d58dfe7e`. The files reapplied without conflict.
The stash is retained as a safety copy; no other worktree was modified. A second
fetch during verification still resolved main to the same SHA.

- `npm run qa:static`: **passed**, including syntax, security/storage guards,
  migration-file checks, performance and architecture checks. Existing 84 module
  size warnings remain.
- `git diff --check`: **passed**.
- Full `qa/playwright.ack-cache.config.mjs`: **286 passed, 1 failed**, 6.5 minutes.
  All 233 shared contracts, all Chromium cases, and the new full-app Schedule
  regression in Chromium and WebKit passed. The last WebKit Sessions conflict
  case timed out in the initial `ready()` call, before the test edited any data;
  its browser context also failed to close within the timeout.
- Isolated five-repeat diagnostic: **2 failed, 3 not run**. Failures occurred
  while setting up the Playwright page, before app navigation. The owning runner
  was interrupted after recurrence instead of repeating a known environment
  failure. No other chat's processes were stopped.
- A separate WebKit-only probe using a blank data URL and no application failed
  its 25-second watchdog before reporting browser launch. This establishes a
  local browser-startup blocker, not proof of a product regression or success.
  Trace/log evidence is in `/private/tmp/ack-cache-integrated-results`,
  `/private/tmp/ack-cache-webkit-recheck-results`, and
  `/private/tmp/ack-cache-webkit-environment.log`.

**Status at the morning interruption: not approved, not committed, not pushed, not deployed.**
Schedule integration is no longer the blocker. The next run should first check
whether the local WebKit environment can launch a blank page, then rerun the full
candidate suite unchanged once it can. Do not skip WebKit, increase its timeouts,
or call the 286 passes a complete approval. Do not close unrelated user apps or
other chats' browsers to recover the environment. The release remains authorized
but must wait for validation and a clear production release edge.

The canonical footballscience `.vercel/project.json` was copied from the prior
release worktree (project `prj_GazeaGD3eThx8p2w1m334AAFNN0x`, team
`team_ayMHRHhvpCWLhB7Hss525k0z`); no environment/credential files were copied.
After eventual deployment, check the changed central-sync module's served hash
in addition to the official production postdeploy checks.

## Recovered environment and candidate approval — 5 November 2026, afternoon

A fresh standalone WebKit probe successfully launched, opened a blank data URL
and closed. No product code, tests or timeout requirements were changed to
recover the environment. Main was fetched again and remained exactly
`009c792fccda564b3d7764e530d78e3f9252f5d7`.

The unchanged complete candidate suite then passed: **287 passed, 0 failed**
(3.8 minutes), including both browser engines and the previously interrupted
Sessions conflict/reload case. Log: `/private/tmp/ack-cache-recovered.log`.
The earlier successful `qa:static` result applies to the same product code and
base; `git diff --check` passed again. The initial failed run remains documented
above and was not converted into a pass by skipping tests or weakening assertions.

Schedule's production workflow completed successfully for `009c792fc`:
https://github.com/maklind88/footballscience/actions/runs/42045295546.
The release traffic guard reported no active edge workflow at inspection.

**The cache candidate has passed its scoped local acceptance checks.** Only its
six intended files are to be committed. User authorization for deployment is
already present in this chat; the official Safe Lane must still pass its full
release gate, staging, production workflow and production verification. Local
approval is not a claim that it is already live or that the entire storage and
offline program is complete. No historical work or cache content was deleted.

## Remaining work in order

1. Keep central acknowledgement/visible reads independent of optional cache
   durability, while retaining truthful local/offline status (this candidate).
2. For each remaining native writer, adopt a bounded, module-owned durable journal
   and read cache using existing Library/Sessions patterns. Full native cache,
   full IndexedDB, both unavailable, reload, two-user conflicts, account changes,
   delayed receipts and old-client rollback are separate acceptance cases.
   Do not introduce one generic automatic replay queue over Medical business rules.
3. Address the 5.06 MiB legacy compatibility footprint only through an explicit
   migration contract: preserve exact bytes and metadata, prove durable recovery,
   export and cold reads, and handle old tabs/rollback. A localStorage
   read-then-delete is not an atomic migration guard. Historical cleanup remains
   outside the user's forward-looking request; this candidate removes nothing.
4. Reduce future safety-history amplification after every consumer can enumerate
   retained versions and mixed old/new clients are defined. Prior grouped-format
   experiments remain excluded; their synthetic savings are not production proof.
5. Re-measure the affected profile and keep per-module acceptance evidence. Do not
   claim that all local reviews are conflicts, that a snapshot count is an edit
   count, or that this candidate completes the platform storage program.
