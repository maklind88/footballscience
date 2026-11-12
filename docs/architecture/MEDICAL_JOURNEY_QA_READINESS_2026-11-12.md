# Medical Journey QA Readiness

## Scope And Ownership

The user explicitly authorized the FS Player chat to fix the blocking Medical test before releasing the FS Player save-reliability candidate. This is a test-only compatibility commit owned by that release. Medical product code, clinical records, permissions, persistence and synchronization behavior are unchanged.

## Failure And Repair

The `lost-response-revision-race` journey timed out in the complete release suite. Its save acknowledgement was coupled to page-wide `networkidle`, which also observes unrelated background requests. The later-receipt journey used the same wait.

The fixture now deliberately holds an unrelated background fetch open in both affected journeys. With the old wait, the revision-race case reproducibly timed out at 60 seconds. Replacing the waits makes the regression deterministic without increasing timeouts or dropping assertions:

- The revision-race case still checks both original base revisions, the single committed effect, the durable acknowledgement, both users' Medical and Sessions views, and cold reload.
- The late older receipt waits for the client's persisted database receipt status before asserting that the newer failure and recommendation remain visible.
- Teardown releases the synthetic gates and waits for route handlers before closing contexts.

## Evidence

All remote services and records in these tests are synthetic. No live Medical writes are performed.

- Before repair, the new sustained-background-traffic case failed at the old `networkidle` wait: `/private/tmp/fs-medical-background-red-20261112.log`.
- After repair, all 10 Medical journey cases passed three consecutive times: **30 passed**, `/private/tmp/fs-medical-readiness-fixed-20261112.log`.
- `npm run qa:static` passed, with existing architecture warnings only: `/private/tmp/fs-player-medical-release-static-20261112.log`.
- `git diff --check` passed.

The full Safe Lane release and production verification are separate required gates. These targeted results do not claim that FS Player is deployed.
