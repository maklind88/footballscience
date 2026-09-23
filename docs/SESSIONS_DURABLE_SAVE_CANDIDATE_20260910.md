# Sessions Durable Save Candidate

Status: implementation and local validation complete. Candidate ready for the
authorized Safe Lane release process. NOT deployed or production-verified.

Owner: Sessions. Affected shared boundaries: System / Security (central sync,
data safety and app-state API). Base: `823dec19cdc8a745f8fe057c59549b3f2c6389b7`.
Branch: `codex/sessions-durable-save-20260910`.

## Product Intent

Preserve coaching content through quota failures, offline work, reloads and
concurrent edits. Do not send the entire calendar for an individual training
change. Never report a central save solely because a local backup succeeded.
Do not hide genuine conflicts or automatically overwrite them with old backups.

## Local Implementation

- Additive `session-date-change-v1` request and matching per-date receipt on the
  existing app-state API. Legacy clients retain their existing request format.
- Three-way date/block/field merge against fresh central content. Same-field
  conflicts return explicit paths. Existing authorization, content validation,
  revision/CAS guards, audit and history remain in place.
- Scoped IndexedDB journal outside rotating snapshots. Rows are removed only
  for a matching server receipt; conflicting copies remain available for review.
- Separate writer identity prevents one browser tab from silently rebasing its
  edits onto another tab's pending edits.
- Late receipts cannot replace a newer observed central revision.
- Explicit review compares central/local fields, block order and deletions.
  Reviewed quota dates no longer reopen automatic recovery. Copies are retained.
- Local fallback reports local/pending status, not server-confirmed Saved.
- Existing selection, frames, marker data and deletion tombstones are preserved.

The database still stores the existing whole-calendar app-state record. This is
smaller network transport and safer reconciliation, not a completed per-session
database migration. Server reads/history cost remains a scalability limitation.

## Approved Integration

The user directly approved the shared save-boundary and local preservation
changes in this chat. That approval does not authorize a deployment, production
data restoration, clearing browser storage, or a database migration.

- Protected storage supplies the actual pre-edit cache. Independent staging and
  network queues preserve newer edits while an older request is still pending.
- Retrying replays immutable journal rows. Failed/coalesced staging retains the
  earliest edit baseline, including rapid edits under localStorage quota failure.
- Archive pre-existing unresolved browser caches before new writes. Archive
  failure stops the write; deduplicated archives preserve review decisions.
  Rotating snapshot pruning cannot delete journal or Sessions review copies.
- Missing central Sessions records initialize an authoritative empty baseline.
  They are never seeded automatically from an old browser cache.
- Read normalization is cache-only. Local fallback is labelled local/pending;
  Saved requires confirmation of the current edit generation from the server.
- Refresh central data before reviewing. Reject stale decisions; preserve the
  local copy and only clear pending status when no newer edit exists.
- Preserve local day, block and frame selection when applying confirmed content.
  Cache-only review completion must not register as another content edit.
- Recheck actor/team scope after encoding/token acquisition and before writes;
  retain old-scope drafts instead of sending them in a new account/team context.
- A post-acknowledgement cache failure reports an issue without discarding other
  modules' queued writes. The confirmed server copy remains authoritative.

Do not force-resolve live records, restore old snapshots, clear browser storage
or bypass release guards. Concurrent tactical frame array edits require review,
not a silent winner. Browser storage remains finite and can be cleared by user
or browser policy; local drafts are not a substitute for central confirmation.

## Validation Results

- Static gate passed: local isolation, syntax, release rules, incident readiness,
  storage policy, platform security, migration safety, performance, architecture.
- Targeted browser proofs: large calendar hydrate/save/reload under full quota;
  real IndexedDB persistence and snapshot pruning; first-record saves; scope
  changes during encoding; review without a write or deletion of the local copy.
- Review dialog inspected at desktop 1470px and mobile 390px, including keyboard
  focus, Escape, no horizontal overflow and literal untrusted text rendering.
- Broad `npm run qa`: 2,913 passed, 3 existing skips, 9.9 minutes. No tests were
  removed or newly skipped. Selection/cache-error follow-ups were validated by
  the final targeted run below rather than claiming an unchanged full-suite SHA.
- Final targeted API/browser regression after those follow-ups: all 225 passed
  in 1.7 minutes. Covers all changed save boundaries, protocol authorization,
  mismatched receipts, permission denial, recovery, frames, markers and playback.
- Final syntax checks for auth boot, selection helper and recovery controller:
  passed. New modules are also imported and exercised by the targeted suite.
- `git diff --check`: passed.
- No production data writes, backup restoration, main integration or deployment
  performed for this candidate. Preserve it only on the isolated Sessions branch.

## Release Requirements

Safe Lane is required. Wait for a direct user `Deploy` or `Live` in this chat.
Recheck origin/main and ownership; commit/push only this candidate. Use official
clean-worktree, exact-SHA and traffic guards, staging checks and authenticated
production verification. Local QA is not evidence of staging or Live success.
Production/staging credentials are not currently exposed in this local test
environment. The previous released transport hotfix is a different change.
