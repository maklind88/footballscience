# Forward snapshot growth — 6 November 2026

Owner: System / Security, shared snapshot storage and acceptance.
Base: `5cb6cfd1769c99727d4831d9680ead9957489c8d`.
Branch: `codex/storage-growth-20261106`.
Consumers checked: snapshot history/export and the Sessions journal sharing the
same IndexedDB stores. Their source data, replay rules and permissions are not
changed. Root-checkout Video Analysis/database-health work and PR #298 are excluded.
The user authorized local implementation and testing, not a release of this task.

## Reproduced unnecessary growth

`qa/snapshot-growth.smoke.spec.mjs` invokes the real data-safety runtime with
native browser storage and IndexedDB. The data, scope transitions and bridge are
synthetic; no user profile or production record is touched. The payload contains
512 KiB of ASCII text, plus JSON and recovery metadata. This test isolates snapshot
capture; it is not a full authenticated account-switch journey or a physical disk
quota measurement.

The old writer compared only the single global latest snapshot. Two alternating
read scopes therefore defeated consecutive deduplication: each scope's unchanged
recoverable version was copied again after the other scope's snapshot.

| Phase | Before: history rows | After: history rows |
| --- | ---: | ---: |
| Initial capture | 1 | 1 |
| Eight unchanged refresh captures | 1 | 1 |
| Capture second scope | 2 | 2 |
| Twelve alternating unchanged captures | 14 | 2 |
| New pending generation, same payload | 15 | 3 |

Before the correction, the growth assertion failed with 14,700,908 serialized
UTF-16 bytes in history after the alternating captures. Afterward the same phase
retains approximately 2,100,130 bytes; timestamps/IDs cause small run differences.
The separate full `latest` copy remains approximately 1,050,660 bytes and does not
grow during repeated transitions. Native localStorage payload remains unchanged.
These are serialized estimates, not physical allocation or origin-quota figures.
The result proves one unnecessary-growth mechanism, not the cause of every
storage incident or a platform-wide reduction percentage.

## Correction and preservation rules

The existing `latest` record keeps at most eight small scope/row references.
A scope's most recent referenced history row is read and compared in the same
readwrite transaction as any pointer/history write. There is no history scan,
new database, schema upgrade, payload compression or per-key backup format.
The hint alone never establishes that a durable copy exists.

Reuse requires equal schema, app, raw stored payloads, recovery copies,
separations, recovery state and full save context. Unknown future top-level
metadata is compared conservatively too. Only known capture/display metadata and
lookup hints are excluded. Changed bytes, generation, owner, revision, deletion
or recovery metadata still require a new full snapshot. Original history rows
are never rewritten by reuse. The legacy full latest envelope is retained for
existing readers, with its original snapshot timestamp, not a new save receipt.

Missing, changed, wrong-scope or evicted references fall back to appending a new
copy. More than eight interleaved scopes can therefore produce extra copies;
this is a bounded optimization, not a universal history-size cap. A legacy client
can overwrite/drop the hints without losing recoverable content. This may lose
some deduplication until updated clients populate the hints again.

No old Library copies, journal/review rows, history payloads or cache entries are
cleaned up or migrated. Existing history rotation for genuinely new snapshots
(maximum 30 ordinary snapshots) is unchanged. Reuse returns `written: false`, so
it does not invoke that existing pruning path. This candidate does not certify
or redesign the existing retention policy. Pending Sessions rows remain in their
own `session-save:` namespace and are untouched.

## Verification

- Initial growth regression: failed before the change, passed afterward in
  Chromium and WebKit.
- Future-metadata conservation regression: failed before the conservative
  comparison was added, then passed in both browsers.
- Full `qa/playwright.snapshot-history.config.mjs`: **193 passed** (1.4 minutes),
  including native growth measurement, unchanged refreshes, changed generations,
  recovery variants, two IDB connections, bounded hints, stale/missing/tampered
  references, legacy latest envelopes, aborted reuse, reload and exact export.
  Existing history access/confidentiality, storage-health and save-status tests
  remain included without weakened assertions.
- `npm run qa:static`: passed. `git diff --check`: passed.
- Additional Sessions journal/version/database compatibility checks: **25 passed
  in Chromium** (29.3 seconds) and **25 passed in WebKit** (55.8 seconds).
  Total scoped browser/contract checks: **243 passed**, no skipped/failed cases.

Reproduction:

```sh
npx playwright test --config=qa/playwright.snapshot-history.config.mjs
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-save-storage.smoke.spec.mjs qa/session-version-transition.smoke.spec.mjs qa/local-database-compatibility.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-save-storage.smoke.spec.mjs qa/session-version-transition.smoke.spec.mjs qa/local-database-compatibility.smoke.spec.mjs
npm run qa:static
```

External logs: `/private/tmp/storage-growth-before.log`,
`/private/tmp/storage-growth-future-before.log`,
`/private/tmp/storage-growth-final-suite.log`, `/private/tmp/storage-growth-static.log`.

## Remaining limits

This prevents new duplicates in the verified scenario; it does not reclaim old
bytes or enlarge localStorage. Distinct edits still produce whole-platform
snapshots. The Library compatibility footprint, byte/age policy for reconstructible
cache, protection/retention of unresolved work, sustained real multi-user traffic,
cold offline application startup and per-module durability acceptance remain
separate work. No staging, production verification or deployment is claimed here.
