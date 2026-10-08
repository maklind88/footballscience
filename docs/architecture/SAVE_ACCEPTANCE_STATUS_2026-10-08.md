# Saved-work acceptance: evidence and remaining gates, 8 October 2026

Task owner: System / Security, continuing the user-authorized save reliability task.
Affected module owners: Medical (clinical persistence contract), Sessions (training and review), Platform Shell (read-only diagnostics). No transfer of clinical rules or permission ownership.
Baseline: 65478a34df10687e8b7101a84ec627bddc65ffb6. Worktree: codex/save-acceptance-evidence-20261008. Shared checkout changes are excluded.

## Decision

Finish the actual incident diagnosis and test online saving plus short interruptions before enabling more offline behavior. Preserve all pending work and legacy copies. Do not delete, replay or choose a real user's retained version. A green release is not a platform-wide acceptance certificate. This task has no new release authorization.

## Current evidence

- Production read-only diagnostic 37781432673 passed on build 65478a34. The previously established incident date is 2026-10-05. One matching active recommendation remains centrally present; normalization reported no errors; the diagnostic performed zero data writes. No clinical values or identity identifiers are recorded here.
- In the signed-in product browser, the target recommendation is selected in Medical on that date, including after a same-tab reload. Sessions Player Board also shows the target with confirmed availability when the incident date is selected. No clinical editing was performed.
- Sessions navigation reverted to 2026-10-08 after reload. Selecting the incident date restored the target recommendation. This is a view-selection observation, not evidence of deleted central work; source inspection confirms transient date navigation; this candidate leaves that contract unchanged.
- Sessions review showed `No unresolved local versions` in this browser/account context. The historical 110 versions over 75 dates must not be described as a current backlog or as resolved/deleted; another device/context may still hold them. User clarification requested.
- The native storage diagnostic measured approximately 7.82 MiB in 32 entries: Library 2.53 MiB, Library Backup 2.53 MiB, Player Profiles 1.32 MiB. Both legacy Library copies matched 49 exercise payloads. This is not a central receipt or deletion permission. Origin estimate: 60.29 MiB; localStorage headroom is unknown. One account/team pending module marker, zero native recovery-copy keys. IndexedDB stores were not yet measured.
- The profile status separately reported a stale Home write rejected by newer central state. Its relationship to the reported Medical/Sessions incident is unproven and no Home implementation is changed here.

## Staging acceptance blocked by version drift

- Run 37782114740 failed `Future activity replaced newer Medical edit`. Run-owned Medical fixtures were archived and temporary-account cleanup completed. Sessions acceptance was not reached.
- This run pinned the build reported by staging, but subsequent deployment inspection proved that staging served old commit c1b1821ab796bb680eb3480979542b6a461af964, deployment dpl_FDBULqi5jGigvky6VoXPUqp7Ju86. Current Medical view preferences and Sessions review files returned 404; medical-merge.js did not match the reviewed source. This failure is not evidence against candidate 65478a34.
- The previously successful staging deployment still exists: dpl_5oarFoQrEzZ1WpJQtAnGd5ee3dhr, footballscience-78h9hb2jb-makattack.vercel.app, from the recorded successful release run 37724366699. Its protected client configuration confirms the staging database.
- Restoring staging routing requires a direct user release/staging instruction under AGENTS.md. Production remains 65478a34. No alias or deployment was changed in this diagnosis.
- Acceptance must reject mismatched reviewed frontend bytes before credentials or synthetic fixture creation. A matching self-reported build id alone proves consistency with that id, not that the selected deployment contains the intended change.

## Acceptance ledger

| Requirement | Medical | Sessions |
| --- | --- | --- |
| Actual incident record visible on selected date | Observed, including reload | Observed after date selection; reload date reset remains |
| Current user's unresolved review diagnosis | Not applicable to current Medical view | No unresolved rows in inspected context; other device unknown |
| Exact currently deployed staging two-user proof | Blocked: wrong staging code served | Not reached in failed run |
| Central confirmation distinguished from local/queued state | Existing targeted tests; full failure matrix incomplete | Existing receipt/journal tests; current staging proof pending |
| Full local storage plus unavailable IndexedDB | Memory fallback is not durable; cannot certify crash recovery | Existing journal evidence; current acceptance pending |
| Crash, lost server reply, account switch and pending work | Not certified against full matrix | Partial prior evidence, not complete module certification |
| Physical storage inventory and safe legacy cleanup | IndexedDB inventory pending; no cleanup | IndexedDB inventory pending; no cleanup |

## Limits

No cache purge, native copy removal, clinical restoration, new offline-module activation or production release is part of the current evidence. General browser restarts/cold offline launch and all-module acceptance remain separate gates. Report passed, failed, blocked and unknown explicitly rather than estimating platform completion.

## Candidate changes and local validation

- Bounded read-only IndexedDB inventory for known Safety/Sessions and Library stores. Reports fixed category labels, counts and approximate JSON UTF-16 sizes only. It does not expose contents, record keys, user identifiers or arbitrary exception messages. Rows across accounts are explicitly aggregate; one recovery snapshot can represent multiple dates and is not a conflict count. Other databases/media remain outside coverage.
- Uses native enumeration followed by readonly cursor transactions, never normal schema-creating helpers. Unsupported/denied/timed-out or truncated scans are explicitly incomplete. Missing stores are not created; an upgrade event is aborted. In a deletion race, tested WebKit leaves a version-zero metadata placeholder even for an unrelated native aborted open. The test records that native comparison and requires no committed schema. No compensating deletion is attempted.
- Acceptance now compares eight critical public frontend assets with the reviewed checkout before login/fixture creation in deployed-frontend mode. Existing exact backend/build guards remain. Intentional candidate overlays retain their separate, explicit label. This public-asset check is not an attestation of hidden server source.
- Three local regressions proved that Medical non-quota storage failures did not return failure or report the issue through the shared save status. The minimal correction retains the draft, returns false and reports unconfirmed saving. It never retries around a permission/hydration guard and does not claim memory is durable.
- Sessions date navigation intentionally updates transient state without saving coaching content. The observed reset after reload is recorded as a view limitation; this candidate does not change its contract.

Production remains unchanged. New diagnostic UI measurements require a separately authorized release. Restoring the reviewed staging alias has been proposed for direct approval; no approval has yet been received.

## Verification results

- Full static gate (`npm run qa:static`) passed, including syntax, release rules, incident readiness, storage policy, platform security, migration consistency, performance and architecture guards. Existing architecture size warnings remain.
- 86 focused data-safety, Medical runtime and storage-health API contract tests passed. Three new non-quota Medical failure cases first reproduced the missing issue report and then passed after the correction.
- 14 focused Chromium and 14 WebKit browser tests passed: saved Medical visibility from both modules, cache/read timing variants, storage diagnostics and retained review versions. These local fixtures do not replace authenticated deployed multi-user acceptance.
- 10 Node tests for acceptance destination/fixture guards and reviewed frontend verification passed. The frontend guard also rejected the actual stale staging `medical-merge.js` using public GET requests only, before any login or fixture creation. This rejection is the intended safety result, not a passing staging acceptance.
- Pending: direct authorization to restore reviewed staging routing, then authenticated acceptance on verified matching frontend/backend. Current candidate bytes differ from the prior release; candidate acceptance must use a separately approved candidate staging deployment or be explicitly labelled an overlay. A restored prior deployment can certify only that prior release.
