# Snapshot growth and restart evidence — 2 November 2026

Task owner: System / Security, shared storage reliability and acceptance.
Affected boundaries: Platform Shell (snapshot runtime); Sessions (protected quota
recovery row). Medical and Library remain owners of their content, permissions,
recovery and central receipts. No module write or retention rule is changed.

Base: `ce535493a56b64095b37bc3943f46c1fa52d3e43`, the 31 October production release
recorded in [PR #293](https://github.com/maklind88/footballscience/pull/293).
Branch: `codex/storage-growth-evidence-20261102`. The root checkout contains unrelated
specialist changes and was not modified. This checkpoint adds QA and evidence only;
it is not a new production release or a certificate for every module.

## Finding

The runtime limits ordinary snapshot history to 30 rows and keeps a separate
latest copy. It does not impose a byte budget. Each genuinely different envelope
copies all protected values, even when the change is only in receipt metadata.
Consecutive identical envelopes are suppressed transactionally. Comparing recovery
metadata is intentional: dropping that comparison would risk treating different
ownership or pending work as equivalent.

This explains a mechanism for storage amplification. It does not establish the
cause of every localStorage quota error, local review entry, server conflict or
missing view. localStorage and IndexedDB have different limits. No real user's
historical work was cleared, replayed, resolved or modified.

## Reproducible measurements

`qa/snapshot-growth.smoke.spec.mjs` uses the actual snapshot runtime and actual
IndexedDB with synthetic content in isolated browser contexts. Scheduled snapshots
are disabled in the fixture so only explicit measured saves run. There is no remote
API/authentication or clinical content. One synthetic protected value contains
128 Ki ASCII characters plus a small revision field, about 256 KiB when counted
as serialized UTF-16. This measure is not physical database size or quota headroom.

After 35 distinct saves, followed by 10 identical saves:

| Change | Chromium history bytes | WebKit history bytes | Ordinary history rows | Latest copy |
| --- | ---: | ---: | ---: | ---: |
| Protected value revision | 7,896,960 | 7,896,952 | 30 | approximately 263,288 bytes |
| Receipt metadata only, unchanged protected value | 7,903,282 | 7,903,278 | 30 | approximately 263,498 bytes |

Small ID/timestamp serialization differences explain the few-byte variance between
engines. The history plus latest copy is about 7.8 MiB, over 31 times the one-value
serialized size including envelope overhead. Identical repeats did not change
rows or serialized byte counts. This proves bounded row count, not bounded bytes
as module payloads grow. A protected Sessions quota-recovery row remained identical
through the rotations and did not consume an ordinary history slot.

The previous affected-browser observation remains the 24 October report:
[SAVED_WORK_FORWARD_EVIDENCE_2026-10-24.md](SAVED_WORK_FORWARD_EVIDENCE_2026-10-24.md).
On 2 November, the existing signed-in tab was located without reload. Its profile
menu showed `Sync needs attention` / `Local changes need review`, which is a generic
status, not a diagnosed cause or conflict count. The menu disappeared before Storage
health could be opened; a read-only check found no open menu/dialog. No new inventory
was obtained and no further interaction was attempted. No clinical or coaching
payload from that tab is included here. Its URL build parameter matched the base;
that alone is not an independent attestation of all loaded assets.

## Failure and lifecycle proof

- A scoped `QuotaExceededError` is injected into the real latest-store write after
  the history put has been queued. The real IndexedDB transaction aborts. Saving
  returns false, both memory/manifest snapshot warnings are set, and committed
  history, latest and the protected recovery row are unchanged. Removing the fault
  permits retry; the latest value advances, ordinary rotation resumes and only the
  snapshot warning clears. This is fault injection, not exhaustion of a real disk.
- A snapshot and protected recovery row commit while the browser is offline. The
  persistent browser context/process is fully closed and relaunched using the same
  temporary disk profile. After loading code assets online, the browser goes offline
  again and reads the exact same rows. This proves that these committed copies survive
  a closed browser profile. It does not prove offline application-shell startup,
  session reauthentication offline, power-loss durability, eviction or full-disk recovery.
- Existing controls still prove transaction abort safety, atomic duplicate suppression,
  distinct recovery preservation and that a successful snapshot cannot acknowledge an
  unrelated failed Medical save.

The tests use disposable local profiles only. No production/staging database,
remote test account, real saved content or user browser storage is written by them.

## Decision and next implementation gate

Do not reduce the 30-row count or remove old snapshots indiscriminately. Snapshot
envelopes can carry pending metadata and recovery contents; the Sessions prefix
exception is not proof that every other row is replaceable cache. Do not weaken
metadata comparison merely to suppress growth. A new architecture or universal
merge engine is not justified by this measurement.

The next bounded change should govern admission/retention of future **verified,
replaceable cache copies**, with protected work accounted for separately:

1. Define a conservative, versioned classification contract. Any unknown scope,
   pending generation, recovery separation/copy, unresolved work or uncertain
   central coverage remains protected. A global sync icon or matching short hash
   cannot authorize retirement. No inferred classification of historical user rows.
2. Define both per-copy and aggregate serialized-byte budgets for the eligible
   cache class, in addition to a row limit. Clearly identify the measurement unit;
   browser physical usage/quota remains a separate signal. Budget selection needs
   realistic multi-module envelope measurements, not just this small fixture.
3. Keep admission, latest reference and eligible history rotation transactionally
   consistent across tabs. Failed admission must leave existing committed copies
   intact and must not claim a new durable save. Do not free capacity first and then
   risk losing the replacement write.
4. Prove that pending/review work survives budget pressure, failed writes, restart,
   two tabs, scope changes and version transition. Ordinary module saves must remain
   independent of optional history-cache success. Test with realistic larger payloads
   and separate actual quota/eviction experiments in disposable profiles.
5. Run the resulting candidate through targeted module acceptance and Safe Lane only
   after direct release authorization. Broader offline startup and all-module
   acceptance remain independent gates.

This checkpoint does not implement the byte policy, alter production or resolve
historical review entries. It establishes the measurable baseline and preservation
controls required before that change.

## Validation

18 browser cases passed: nine Chromium and nine WebKit (four new cases per engine
plus the five existing distinct-snapshot/save-status controls). `npm run check`,
`npm run release:rules`, explicit new-test syntax and `git diff --check` passed.
The new file is included in ordinary Chromium smoke discovery and explicitly in
the WebKit saving config. No dependency or product-code change.

Local logs: `/private/tmp/snapshot-growth-{chromium,webkit,controls,check,rules}-20261102.log`.
