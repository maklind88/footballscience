# Medical pending candidates, 2026-10-23

No release is authorized by this preparation. Do not merge main, stage, or deploy
until the user explicitly requests a release in the Medical chat.

## Product candidate

Branch: `codex/medical-rtp-ready-20261023`

Base: `2e263ce4bb337abbdec1f43e60e11827c9a3bd7b` (origin/main at preparation).

Replaces the stale `codex/medical-squad-injury-rtp` candidate. Medical owns this
task. Squad remains the owner of roster status; Session Planner consumes the
Medical availability contract. No Squad or Session Planner production code is
changed, and there is no migration or live-data write during preparation.

- Allow Medical recommendations for injured, managed, and rehab status.
- Keep the date-aware Squad status badge visible.
- Preserve zero-participation absence when clinical status has no dated Medical
  recommendation or plan. Clearing a recommendation returns to that fallback.
- Preserve existing latest-plan/recommendation precedence and clearance checks.
- Continue blocking non-clinical absence and unknown/new configured statuses.
- Do not change percentage colors, sorting, save paths, or read/save isolation.

The original candidate incorrectly made an injured player without a recommendation
unconfirmed instead of absent. Do not deploy that branch directly.

Validation: focused helper, activity, display, state-service, and Session Planner
consumer contracts; browser coverage for clinical recommendation, long-term zero
plan persistence, and training metrics; syntax and whitespace checks.

Risk: Medical business-rule change, therefore Safe Lane is required at release.
Local preparation is not production verification. Fetch/rebase and repeat relevant
checks before the later authorized release.

## Separate test candidate

`codex/medical-release-smoke-cleanup-20261022` contains QA-only follow-up from the
Medical release: isolated cleanup of a uniquely identified synthetic Schedule
record, correct date navigation, and preservation of primary failure diagnostics.
It must remain separate from clinical product logic. Schedule product code and
central sync are not to be changed by this follow-up.

## Obsolete work

Navigation performance, note-permission repair, Recovery tab, session-block
thresholds/sync, and preservation of removed players' Medical history have
successors on main. Preserve old tips in recovery refs before removing stale
branch names. Historical RTP/Squad prototypes with unique code are not authorized
release candidates and must not be bundled or deleted without ownership review.
