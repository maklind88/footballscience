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
