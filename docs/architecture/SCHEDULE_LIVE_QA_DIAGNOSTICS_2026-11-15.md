# Schedule live QA investigation

Owner: the FS Player/DM release chat, expressly authorized by the user to investigate
the blocking Schedule test before releasing the DM inbox fix. Schedule product
changes and release-protection changes have not been made in this candidate.

## Confirmed evidence

- Production Monitor run `43647719749` tested production commit
  `119e93488e8d218e7e26dd457c3aa2c1dd5addd5`.
- The two-account DM unread/read-receipt test passed on that existing production
  version. This does not verify the unreleased DM fix `8390dd155`.
- The Schedule test showed its synthetic event in the UI but failed the existing
  local-storage inclusion assertion. It never reached its central-save assertion.
- The observed API window contained no Schedule POST for that event. The 409
  responses in the window concerned Home, not Schedule.
- The run-owned cleanup fixture completed and verified exclusion.
- Subsequent monitor `43685547380` reproduced the same Schedule assertion failure
  and again passed the two-account DM test on the unchanged production SHA.
- A separate manual live Schedule addition received `Saved to team`; Undo also
  received `Saved to team`. The session expired on the subsequent reload, so this
  is not a completed persistence/reload proof and used a different account from QA.

## Candidate diagnostics

`qa/helpers/schedule-save-diagnostics.mjs` adds failure-only diagnostics to the
existing Schedule local-storage assertion. It reports fixed error categories,
booleans, lengths and revisions. It never returns stored values, session tokens,
account/team scope, event titles or arbitrary error messages. Only Schedule-owned
save issues are included, with a five-item bound.

The assertion, its timeout, the central-save check, reload check and run-owned
cleanup remain unchanged. A missing record still fails the run.

The live-auth global setup currently copies a complete browser storage snapshot
before waiting for central hydration. Stale/partial setup state is a hypothesis,
not a confirmed cause. Do not change production save guards or clear user data on
the strength of this hypothesis.

## Verification and next step

- `npm run check` passed.
- 219 scoped Chat/Schedule API-contract tests passed.
- 18 Schedule browser persistence/ownership regressions passed.
- 12 repeated DM unread/read-receipt/reload tests passed across Chromium and WebKit.
- The new diagnostics have contract coverage for rejected metadata writes,
  successful receipt/read state, storage exceptions and privacy.
- Full release validation and candidate live verification remain outstanding.

Local QA credentials were unavailable. Inspection found `main` and `staging`
unprotected and the platform release environments without required reviewers.
User approval was requested for a narrowly scoped review-gated diagnostic/release
path before running new code with CI secrets. No branch protection, environment,
workflow, main/staging ref or production deployment was changed.

Next: obtain the actual failure categories using the QA account through a reviewed,
protected execution path, reproduce the confirmed cause, add its regression and
minimal fix, then complete the Safe Lane release and two-account live DM proof.
