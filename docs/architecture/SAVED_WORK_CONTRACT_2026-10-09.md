# Saved work contract: platform-wide rules, module-owned implementations

Owner for this work: System / Security. Affected boundaries: Medical (clinical
working state and recovery UI), Platform Shell (existing read/reload contract).
Sessions and Set Pieces are inspected reference implementations; this change does
not transfer their ownership, change their writes, or certify them anew.

## Problem and evidence

The [Saving Reliability Program](../SAVING_RELIABILITY_PROGRAM_20260913.md)
already defines shared saving invariants. The gap is incomplete enforcement and
end-to-end evidence, not absence of an architectural plan. This record applies
those invariants to the newly reproduced Medical transition and makes the module
acceptance matrix explicit. It does not replace the program or create a second
save framework. Existing protections remain valuable, but their existence does
not establish end-to-end correctness.

Candidate d16ff9ea passed 4053 local tests (three file-dependent skips) and staging
run 37878294343. Main QA 37879376445 then exposed a Medical working-draft loss:
localStorage quota + rescue IndexedDB denied + remote POST503, followed by a
runtime reread, returned the old central text. Production release was stopped.

A deterministic regression now explicitly invokes the ordinary
reloadCentralizedAppStateFromStorage after the failed save. It fails before the
fix without sleeps or random repetition. Medical readMedicalState reads the old
cache; reload replaces the working object with that read. The generic write queue
can still contain the serialized intent but is not the Medical editor's owner.
No retained IndexedDB row exists when that transaction cannot commit.

Both read/reload behavior and the memory-only quota fallback also exist in
56063c14 (the inspected production version). The exact scheduling trigger in the
CI trace is not fully attributed. The deterministic sequence proves the vulnerable
transition; it is not evidence that the CI event was necessarily the same caller.

## Common requirements

| Boundary | Required behavior |
| --- | --- |
| Ownership | Every working version, persisted draft, request and receipt has an actor/organization/team scope. Unknown or changed scope cannot authorize display or replay. |
| Working intent | Capture the intended version before asynchronous storage/transport work. A reread cannot silently discard it. In-memory preservation is not durable saving. |
| Accepted baseline | Record the observed central revision separately. Cache contents, a queue marker and a global sync icon are not proof of central acceptance. |
| Presentation | An unchanged baseline cannot erase the current working version. A newer/different authorized baseline remains available; conflicting work stays explicitly reviewable. Never conceal central records behind an unrelated recovery generation. |
| Local durability | Claim local saving only after the payload transaction commits. Request success, queued snapshots and pagehide initiation do not qualify. |
| Central acceptance | A receipt must identify the submitted generation and scope. An older result cannot acknowledge a newer edit. Lost responses require reconciliation rather than blind replay. |
| Concurrency | Independent changes may combine only through a module-owned, tested conflict protocol. Same-field conflicts and deletes must remain explicit; no automatic generic clinical merge. |
| Errors | Cache, draft-storage, permission and transport failures remain distinguishable. A success in another module or generation cannot clear this failure. |
| Retention | Reconstructible cache has a budget. Unresolved work is not cache and cannot expire merely by age. Verified retirement is explicit and generation-specific. |
| Security | A user/team/role switch hides inaccessible work immediately. Reconnecting revalidates permissions. Offline clients cannot learn new server revocations while disconnected. |
| Lifecycle | Test interruptions before/during/after local commit and server receipt; separately test reload, full browser restart, old tabs and rollback. |
| Observability | Report failed/pending generations and bounded size/counts without clinical values or tokens. Record evidence per module and deployment. |

The platform must never promise recovery after both all local storage and the
network fail and the tab/process closes. While the tab is open, keep the working
version accessible, label it unsaved and provide a user-initiated download.

## Existing architecture comparison

- **Medical:** one clinical state blob, generic central queue/manifest, scoped
  rescue IDB and exact central-copy verification. Previously no independent owner
  for the working version after a failed browser write. The pilot adds that owner
  without changing clinical merge rules, server writes, API permissions or schema.
- **Sessions:** session-save-client already separates baseline/revision, in-memory
  draft tokens and immutable journal rows. It projects allowed changes over the
  baseline and keeps reviewed conflicts separate. A generation-specific receipt
  retires its own row. Use this separation as a design reference, not as proof of
  all failure cases or permission to replace the implementation.
- **Set Pieces:** a module save client separates baseline/revision and a scoped
  operation journal of play changes, with its own replay/review protocol. Its
  transaction and failure boundaries must be verified independently.
- **Other modules:** no new certification from this work. The existing acceptance
  [acceptance ledger](SAVE_ACCEPTANCE_STATUS_2026-10-08.md) remains evidence input;
  every module needs the matrix below.

Do not create a universal whole-blob merge engine or migrate every module at once.
Use common semantics and acceptance cases; keep conflict rules with their owners.

## Medical pilot decision

A separate tab-local working set owns failed writes by scope, exact previous value,
observed read revision and generation. Later edits on that same baseline update
the working version. Different baselines remain separate review branches. Copies
committed to rescue IDB provide history; tab memory is not a version-history store.

Medical may project its active working version only over an exactly unchanged
value AND observed revision, under the same authorized scope. The read path does
not persist that projection or enqueue it. A changed/removed baseline, new revision,
read-only central view or changed access cannot adopt the old working version.
The review panel keeps a divergent working version available independently.

A known read-owner mismatch rejects the write before cache mutation, rescue or
queueing, so a late old edit cannot acquire the new account's authority.

Beginning a new ordinary save releases the older working projection. If the new
save fails, its own intent becomes active. An older delayed rescue commit only
confirms its own object. Retry of local rescue uses the original base revision;
it must not relabel the selected intent against the current server version.

When IDB is unavailable, the panel explicitly labels the version as existing only
in this open tab, offers exact export and a local-rescue retry. It never exposes
central retirement for an unpersisted row. Retried committed rows survive reload
and then use the existing private fresh-read verification before explicit removal.

No central replay, clinical conflict resolution, destructive cache cleanup,
permission change, migration or automatic production release is introduced.

## Acceptance matrix and rollout

For each module, record a concrete test and exact candidate/deployment for:

1. Normal save and cold reread; missing initial central record.
2. LocalStorage unavailable, IDB unavailable, both unavailable; full quota.
3. Working edit -> unrelated/background reread -> export/retry -> reload.
4. Fresh changed/deleted central baseline while work is pending; no false receipt.
5. Two users and two tabs: independent edits, same-field conflict, delayed replies.
6. Lost server reply after commit; duplicate delivery; later generation remains.
7. Logout, team/organization switch, permission loss and reconnect.
8. Upgrade/rollback with pending work; bounded caches and retained unresolved data.
9. Authenticated staging acceptance; release gates; exact production verification.

Medical first: prove the newly exposed transition and the working-version rules,
then validate the existing central/conflict/access compatibility suites. Follow
with deployed acceptance before calling the pilot production-certified. Sessions
and Set Pieces are next owner-specific assessments; remaining modules follow in
separate compatible candidates. This is not platform-wide offline certification.

## Limits that must remain visible

- This pilot begins at an attempted clinical save. Unsubmitted form text before
  input/blur/submit remains a separate acceptance obligation.
- Browser eviction, exhausted process memory, disk loss and closure before local
  commit cannot be reported as saved. A download starts only on the user's action.
- Working revisions coalesce on the same baseline; unresolved different baselines
  remain in tab memory until local persistence succeeds. Persistent rescue uses
  existing 128-copy/~32MiB limits. A universal memory-pressure policy is not
  established here and must not be claimed as an all-module storage solution.
- Clinical differences are preserved for review/export, not automatically merged.
- Current local tests do not replace authenticated distinct-user deployed tests.

Release status and exact verification results belong in the task's evidence record.
