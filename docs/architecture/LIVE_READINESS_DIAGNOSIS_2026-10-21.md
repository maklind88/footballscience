# Live readiness investigation — 21 October 2026

Owner: System / Security / Release, under distributed-specialist-v4.
Affected boundaries: central synchronization and release QA. Home / Dashboard owns
Home writes; Medical Room owns clinical data. No product write paths, permissions,
timeouts, database schema or deployment configuration change in this candidate.

## Question and production identity

Production Deploy [39606803002](https://github.com/maklind88/footballscience/actions/runs/39606803002)
published `09e9ccbcc8758a3879f49bbea582e3d4c4a3a531` successfully, then failed
the two-user DM test's overall 90-second timeout in its fourth signIn, waiting
for central readiness after the primary user's reload. Earlier unread and
server-side read receipt assertions passed; the final UI receipt did not execute.
The last state was hydrated=true, hydrating=true, error=none.

Live client-config still reports that exact SHA. Deployment:
https://footballscience-4yemw1ckw-makattack.vercel.app
(`dpl_7QcEmthK6AtbZ5EjkG46JJDJm3vQ`).
No deployment or rollback was performed during this investigation.

## Subsequent real evidence

Without product or test changes, Production Monitor
[39641413825](https://github.com/maklind88/footballscience/actions/runs/39641413825)
and [39680792900](https://github.com/maklind88/footballscience/actions/runs/39680792900)
both passed: seven Live tests, one intentionally staging-only skip. The previously
failed DM case took 53.5 and 49.9 seconds respectively. This establishes later
successful production verification, not a retroactive pass for the failed release.

The diagnostic candidate `4f2c60aa0b34710b281f593adb740f116f964a40` ran the
unchanged Production Monitor workflow against the same deployed product:
[39705543457](https://github.com/maklind88/footballscience/actions/runs/39705543457).
Seven tests passed, one staging-only case skipped; the DM case took 48.8 seconds.
Backup readiness covered 24 protected keys / 19 present entries; the read-only
restore drill parsed 19 entries across 15 modules without writes.

Measured DM signIn calls:

| Attempt | Full signIn | Central initial readiness |
| --- | ---: | ---: |
| 1 | 6.756 s | 4.178 s |
| 2 | 15.861 s | 12.804 s |
| 3 | 4.247 s | 1.710 s |
| 4 | 3.853 s | 0.881 s |

Two other signIn calls in that same successful suite took 35.487 and 33.073 s.
Their first readiness polls failed and the existing server-session fallback ran;
the second central waits took 18.943 and 16.273 s. They started 57 and 56
browser app-state requests respectively. No observed request failed at the
network layer or returned 429. The longest completed individual app-state
request was 3.634 / 3.457 s. Four HTTP errors occurred in each of these two calls.
The count includes browser GET and write activity; it is not a count of user edits.

## Runtime-log correlation

Read-only Vercel runtime log inspection used the exact production deployment,
only /api/app-state warnings/errors and bounded UTC windows. No credentials,
actor IDs, IPs, request payloads or clinical records are retained here.

| Window | Rejected old Home writes (409) | Old shell writes (409) | Medical emptying protection (409) | Transfer Room denial (403) |
| --- | ---: | ---: | ---: | ---: |
| Original failing run, Oct 21 13:34:00–13:38:10 UTC | 48 | 3 | 2 | 1 |
| Diagnostic run, Oct 22 01:28:20–01:31:40 UTC | 28 | 0 | 1 | 2 |

Both windows fall on October 21 in the user's America/Los_Angeles timezone.
These are deployment-wide observations within the test windows, not proof that
every record belongs to a QA account. The queries returned 54 and 31 security
events, below the 100-record request limit.

The server reasons explicitly reject stale Home/shell snapshots, an attempted
Medical write that would remove all clinical records and injury plans, and a
Transfer Room write outside the actor's access. These are protective rejections;
the logs do not show accepted destructive writes.

## Confirmed mechanism and limits

In `src/core/central-sync-runtime-service.mjs`, the generic 409 path can call
`bridge.hydrate({ forceApply: true })`. In `platform-auth-boot.js`, an unscoped
hydrate reads all configured batches, and concurrent hydration requests can
schedule a successor hydration. The Live readiness check requires hydrated=true,
hydrating=false and no read error.

Repeated stale writes can therefore cause repeated full hydration and prolong
readiness. The timings prove actual slow readiness during a passing test, so
raising the overall test timeout alone would hide a useful signal. However,
the original failed run has no uploaded trace and no phase timings: its exact
initiating write and full causal sequence are not yet established. Slow hydration,
automatic conflict recovery and the test's four signIn calls can all contribute.
Do not claim a proven sole root cause, a database outage or a lost user record.

## Candidate and safeguards

- `qa/helpers/live-readiness-probe.mjs`: fixed phase labels, durations, counts,
  fixed API route labels and boolean readiness only. Query strings, headers,
  response bodies, arbitrary error messages and identities are excluded.
- `qa/production.live.spec.mjs`: wraps existing signIn steps; preserves existing
  timeout, fallback behavior and every product assertion.
- `qa/live-readiness-probe.api.spec.mjs`: covers deadline exhaustion versus slow
  stage, original exception propagation, secret exclusion, bounded pending
  requests, failed network requests, listener cleanup and idempotent finish.
- Budget estimates start at beforeEach and exclude earlier fixture setup; they
  are explicitly estimates. Browser request events do not include APIRequestContext
  calls inside the server-session fallback, which has its own stage duration.
- No trace/screenshot upload is added: raw production traces can contain user data.
- Twelve targeted contracts and `npm run qa:static` passed. Diagnostic monitor
  passed with the exact candidate above and unchanged Live source.

## Next bounded work

System / Security should trace the generic conflict-to-hydration boundary with
Home / Dashboard's write ownership explicit. First reproduce startup/reload with
a newer central Home revision and record which initialization/renderer path
queues an old snapshot. Verify it with a controlled two-context regression before
changing behavior. Distinguish harmless hydration/cache writes from new user
intent; preserve pending drafts and the server's stale-write protection.

Investigate the observed Medical emptying rejection and Transfer Room denial
within their owners' boundaries; never bypass those guards to make readiness
green. Any product fix requires scoped acceptance for legitimate edits, stale
writes, concurrent users and scope changes. This checkpoint certifies diagnostics
and current monitor success, not every module's saving behavior or the previously
reported missing individual recommendation.
