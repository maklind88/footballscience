# Save issue isolation: bounded follow-up, 8 October 2026

Owner: System / Security, for the existing shared save boundary. Affected owners:
Medical (clinical persistence), Sessions (training save/review contract) and
Platform Shell (status display). Clinical writes, permissions and conflict policies
stay with their existing owners. Base release: 56063c14487d0821ea1b87400ec570abfeb66d6d.

## Problem and evidence

Four new regressions failed against the released runtime: an unrelated Schedule
write cleared a Medical warning; retrying one of two failed modules cleared both;
another account could clear the earlier account's warning; and a warning reloaded
from the manifest disappeared after an unrelated write. A fifth test confirmed
that a newer failure reported during queueing must survive an earlier write.

The defect was in recordWrite, which cleared a single global error before the
raw write and queueing had completed. The earlier snapshot fix did not cover this.

## Decision and implementation

Retain advisory save issues by module, existing principal scope and report id.
Capture the outstanding report ids before a write. Clear only those ids after the
normal local write and queueing path succeeds, and only while that scope is still
current. A later report remains outstanding, including one from another runtime.

Keep failed issue-metadata persistence in memory and show the warning while the
page is open. Clearing a warning also requires successful metadata persistence.
This fallback does not promise survival after closing the page.

An extra regression found that an older memory-only warning could mask a newer
persisted report from a second runtime. The final merge retains both report ids;
acknowledgement filters only the ids observed before the successful write.

The new local-save-issues module is small and separate from the existing runtime.
The manifest addition is advisory metadata, not a draft journal, central receipt,
new database schema, permission grant or replay mechanism. No protected coaching
content, recovery copies or snapshots are deleted or rewritten by this change.
Ordinary writes continue through the existing guarded paths.

## Alternatives and limits

- Clearing all errors after any successful write or central read is unsafe.
- Guessing an old error's owner from lastKey is unsafe; older unowned warnings
  remain visible. This change does not invent an acknowledgement for them.
- A central acknowledgement alone does not clear these local warnings without
  matching report/draft generation evidence. That correlation belongs in the
  Medical durability follow-up; the existing central error channel is unchanged.
- No claim is made that the shared localStorage manifest becomes an atomic,
  cross-tab data journal. Tested interleavings preserve warnings; durable draft
  concurrency requires the separate transactional acceptance matrix.
- Rollback leaves additive metadata and user content in place. Old code does not
  understand issue isolation and can again display misleading aggregate status.

## Storage and timeout investigation

The production UI on release 56063c14 reported 7.82 MiB estimated localStorage
contents. Its bounded IndexedDB scan read 11 Safety snapshots (92.08 MiB estimated
JSON UTF-16 size) and one latest copy (8.37 MiB), then stopped at its configured
100 MiB scan budget. The scan was explicitly incomplete, not a complete database
size or proof of disk exhaustion. Browser origin physical estimate was 62.12 MiB.
The Library scan reported five rows totaling about 5.71 MiB in the same JSON metric.

Source inspection explains a multiplier: each historical snapshot contains the
whole recoverable local dataset, with up to 30 ordinary historical snapshots plus
a latest copy. Existing consecutive-snapshot deduplication compares content and
recovery/ownership metadata atomically; its tests preserve distinct recovery data.
A metadata change can legitimately create another full snapshot. This evidence
does not establish a leak or authorize deleting old copies. Protected Sessions
recovery snapshots are excluded from ordinary rotation. No retention change is
included here. Future diagnostics should count all known stores without making
large payload scans unbounded.

A read-only Vercel log query for the exact released deployment, 21:18–21:24 UTC,
found 28 warning/error records on /api/app-state: 24 stale Home rejections, two
Medical destructive-write guard rejections, one Transfer Room access rejection,
and one stale platform-shell rejection. Their logged durations were at most
194 ms. This window overlaps release QA. There is no request correlation proving
that any of these caused the observed browser timeout; actor identifiers, IPs and
clinical values are deliberately omitted. Do not bypass these guards or describe
this as an established server-latency root cause.

## Acceptance and remaining work

Required candidate gates: focused data-safety/central-sync/Medical contracts,
Chromium and WebKit issue/snapshot tests, broader Chromium sync and visibility
regressions, and the full static gate. Track actual results in the candidate PR.
These gates do not certify Medical crash recovery, cold offline use, every module,
or production behavior of this unshipped follow-up.

The next Medical gate remains MEDICAL_DURABILITY_NEXT_GATE_2026-10-08.md:
transactionally retain the actual scoped draft and generation, integrate authorized
reopening/review, and prove quota, crash, lost-response and concurrent-writer cases.
Do not retire legacy copies or enable broader offline behavior before that proof.

## Completed local verification

- 231 targeted API/contract tests passed.
- 99 Chromium save/sync/snapshot/Medical-visibility tests passed.
- Eight focused WebKit issue/snapshot tests passed.
- Full qa:static passed, including npm run check, storage/security policy and
  architecture budgets. Existing 84 oversized-file warnings are unchanged.
- git diff --check and syntax check of the new module passed.
- The four original regressions and the later cross-runtime generation regression
  were observed failing before their respective corrections.

Candidate branch: codex/save-error-isolation-20261008. GitHub checks and any future
release are separate gates. No production publication is performed by this follow-up.
