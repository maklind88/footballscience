# Shared recovery visibility and module read isolation

Task/release owner: System / Security for shared synchronization and saved-work safety.
Affected module owners: Medical Room (clinical source data) and Sessions (training,
local journal and review UI). Medical domain code is unchanged. Sessions changes
are limited to its readiness accessor and adapter to the existing review flow.
No schema, API authorization, clinical rules or conflict protocol changes.
Safe Lane is required. Released base: `2eb24114edc282e4f964d05ab5bf4257cc5c8739`.

## Problem and evidence

Pinned staging run 37508787099 found valid Sessions data in the parser/cache but
not the runtime/DOM. Medical recovery had failed after the guarded QA browser
blocked an incidental write. No overlay, edit permission or off-day rule explained
it. A deterministic synthetic browser regression reproduced the stale view.

Retaining the unsent Medical draft exposed two further defects: hydration
bookkeeping could replace the pending generation, and HTTP 403 handling cleared
pending intent without a receipt. These were fixed and covered independently.

Candidate-browser run 37511081312 passed real two-account Medical API checks and
opened Sessions, but the online coach's change never reached the server. Scoped
cleanup completed. A local cold-start regression reproduced the shared queue
waiting for global hydration despite Sessions having its verified own baseline.
The same global prerequisite also prevented local review. A reconnect regression
then proved that there was no direct online event handler to request recovery.

## Smallest compatible changes

- Auth boot emits the existing partial-read event after failed recovery, scoped
  to the current actor and verified read keys, including journal projections.
- Hydration preserves pending generation, hash, owner and tombstone bookkeeping.
- HTTP 403 retains pending work; it does not acknowledge or immediately requeue it.
- Sessions exposes whether its existing client has an observed baseline for the
  current actor/team. The shared queue uses that proof for Sessions writes;
  unverified keys and whole-key deletions keep the existing hydration guard.
- Session review uses a fresh, Session-only read through the same hydration path.
  That read preserves unrelated metadata, pending drafts and failure status; it
  cannot seed a whole-module snapshot or declare the entire platform hydrated.
- Pending read calls remain serialized/coalesced. Scope/token checks still apply.
- Partial reads can resume only the current Sessions journal. They do not replay
  the generic manifest. Scope is checked again after reading the journal.
- An online event requests a fresh read before retry. Failed reads still use the
  existing bounded backoff; failed writes are not given a blind retry loop.

The server remains authoritative. A visible read, local cache update, denied
write or partial recovery is never a save receipt. No blanket reload, storage
clear, unconditional overwrite, permission bypass or snapshot restoration is used.
Other modules' independent save protocols are follow-up work, not implicitly
converted by this change.

## Validation

The stale-view, cold-start save and reconnect regressions failed before their
respective fixes. Six new browser cases now pass: HTTP 503/403/network failures,
startup recovery failure, successful independent Sessions save, failed delivery
and reconnect, retained Medical draft, same-field conflict and explicit Keep
central. Review is denied when Sessions' own fresh read fails, retaining the draft. A same-user organization switch revokes old read readiness until the new organization is read.

289 focused contracts pass, covering existing sync/read/recovery behavior plus
key readiness, current actor/team, partial journal replay, unrelated pending data,
whole-key deletion guards and the online event. `npm run check` and `qa:static`
pass, including security, storage, migrations, performance and architecture guards.
All 1,387 shared contract tests, 116 focused browser tests and 15 diagnostic/fixture tests pass. The initial expanded browser run had two ENOENT trace-file failures from concurrent test runners sharing an output directory; the isolated rerun passed all 116. Real candidate-client staging acceptance remains the next required check.

## Limits

The production Ella incident proved central presence only, not the exact version
or affected browser's view. Do not assert that every missing recommendation has
this cause. Current changes are candidate work and have not been deployed.
Browser overlays are explicitly labelled and only replace candidate JS in the
isolated QA browser. Deployed-frontend acceptance and production verification
remain required after an authorized Safe Lane release.

## Further real-staging diagnosis: transport failures blocking the queue

Runs 37514957463 and 37515609687 retained the online-peer timeout. The latter's
content-free diagnostics established that the peer was fully hydrated, Sessions
was individually ready, the local edit and journal were pending, all eight
candidate files had loaded, and no Session POST reached even the test guard.
Only unrelated Workspace/notification writes had failed. Thus the earlier
peer-save timeout alone did not establish its cause; the cold-start coupling
was independently real, but this case also hit queue-wide failure propagation.

Three new unit regressions failed for transport status 0, HTTP 500 and HTTP 503:
a failed unrelated write stopped later verified Sessions writes. The queue now
retains only that failed generation, continues other verified writes in the
current pass, and returns failure to prevent a self-scheduled retry loop. Read,
permission, generation, scope, conflict and whole-key deletion guards remain.
110 queue contracts and the real-editor synthetic regression pass. The expanded
117-browser and shared-contract suites and the real staging acceptance are being
repeated on this final queue change. No production release has occurred.

## Untouched-date representation at the Sessions write boundary

Run 37516450329 reached a Sessions POST, which the own-date guard blocked; the
limited diagnostic did not yet distinguish an out-of-date command from a decode
failure. A local reproduction with a legacy unedited date proved a separate
write-boundary problem: adding view defaults to that date journaled it before
the intended edit. Blocking that unrelated date then stranded the desired save.

The existing Sessions storage adapter now accepts the normalized pre-edit view
as a comparison baseline. Dates unchanged in that view and their tombstones
retain their original shared representation, including unknown legacy fields.
Valid local block/frame selection is preserved. Real coaching edits, multi-date
changes, and tombstoned deletions still use the existing command protocol.
No filtering or permission guard in the staging harness is relaxed. It now
reports the blocked Session-command category without revealing content and
loads the updated storage adapter as its ninth candidate-only JS asset.

194 focused queue/client/recovery/storage contracts and four cold-start/editor
browser tests pass, including the previously failing untouched-date example.
The broader regression and pinned real staging proof remain in progress for
this final adapter change. This is a narrow saved-work boundary change owned by
the current System/Security task with Sessions as the affected module; it is
not a transfer of Sessions domain rules or UI ownership.
