# Medical-role staging verification

Completed 2026-11-07 03:07 UTC (2026-11-06 in America/New_York).

- Test commit: `3b9a54a7d1657c313ce05771acd74a178adb431b`.
- Workflow: https://github.com/maklind88/footballscience/actions/runs/42332423756
- Target: `https://staging.footballscience.xyz` only.
- Expected staging build: `dpl_63aya4vdYqnJDnGWH4JPRhC4et1U`.
- All 20 guarded public client assets matched reviewed source before login.

## Verified

An actual temporary Auth account with the `medical` role, not an admin role
override, received the same server Schedule as the staging admin (revision 1897).
The Medical recommendation control was enabled for an existing server training
on 2026-12-23, without writing a recommendation on that date.

The medical account then clicked 50% for a synthetic player on an isolated
fixture date. The real canonical API accepted the recommendation. The generic
write initially returned a revision conflict (409), retried successfully (200),
and both accounts read the accepted recommendation at revision 4336. Medical
and Sessions displayed the same record before and after fresh page reloads.
Unrelated Medical content remained unchanged.

The fixture's roster entry and isolated training prerequisites were injected
only into test-browser reads. Recommendation writes and receipts were real
staging API calls. This does not certify Schedule or Squad write persistence.

Cleanup archived the synthetic recommendation/player and deleted the temporary
account, revoking the test sessions. A separate read-only Auth check confirmed
zero remaining medical test accounts created during this run.

## Checks and boundary

- 17 local Node fixture/frontend tests passed (also passed in CI).
- 55 local Medical journey/reconnect guard contracts passed.
- 1 authenticated medical-role browser test passed in 34.9 seconds.
- No production writes, deployment, staging routing change or main integration.
- No real player's recommendation was changed.
- This proves the staging medical-role flow, not every staff member's existing
  production session/cache or visibility of the recovered November dates.

The new opt-in test remains on `codex/medical-role-verification-20261106`.

## Explicitly authorized production verification

The user subsequently requested the same verification live, without changing
real players' recommendations. Completed 2026-11-07 03:19 UTC.

- Production build: `5cb6cfd1769c99727d4831d9680ead9957489c8d`.
- Test code: `e549487d8` on the same isolated test branch.
- Successful run: https://github.com/maklind88/footballscience/actions/runs/42333391217
- 20 Node guard/frontend tests and 56 Medical guard contracts passed locally.
- Authenticated production browser test: 1 passed in 34.4 seconds.

The actual temporary medical-role account received the same authoritative
Schedule as admin. Training controls were enabled for November 5, 6 and 9.
Those dates were checked without recommendation writes.

A synthetic-only recommendation on an unused fixture date was accepted by the
real canonical Medical API (HTTP 200). Both medical and admin contexts displayed
the same 50% record in Medical and Sessions after fresh server reads and reloads.
The unchanged-unrelated-Medical-data assertion passed.

All aggregate app-state writes were blocked in the test browser before parsing
or delivery. Only the exact guarded synthetic recommendation and its archival
reached the Medical write API. This verifies the canonical saving path, not a
production aggregate write or every existing staff browser's local state.
Synthetic roster/training prerequisites existed only in test-browser reads.

The first run (42333180151) accepted and read back the synthetic record, but
failed the test harness's request-guard assertion. Cleanup completed. The test
was tightened to reject aggregate requests before ownership parsing, with a
regression test; no product code was changed or deployed.

Independent read-only production SQL checks after the successful run confirmed:

- Zero remaining temporary medical accounts created during these runs.
- Both synthetic recommendations archived.
- No persisted synthetic player in Medical's roster.

Sessions were revoked before account deletion. Existing recommendations, plans,
Squad data and Schedule data were not changed. No deployment, main integration,
backup restore or production configuration change occurred.
