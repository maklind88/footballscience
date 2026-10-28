# Protected snapshot retention and bounded admission

Task/release owner: System / Security. Affected boundaries: shared browser safety
snapshots; Sessions owns its recovery prefix and operation rows; Medical owns its
clinical writes and recovery rules; Library owns its records and retained copies.
This candidate changes no module journal, central API, permission or merge rule.
No historical user data has been inspected, repaired, cleaned or exported by this
implementation. Fixtures and timings below are synthetic.

## Problem and decision

The previous writer appended a complete envelope to history and another complete
copy to `latest`, then pruned in a separate transaction using key order and a count
of 30. Only the dedicated Sessions recovery prefix was excluded. Ordinary rows
could contain pending or unknown recovery state. A quota failure during insertion
could prevent the later cleanup from running; a more aggressive pre-cleanup would
instead risk deleting the only retained work before its replacement committed.

Keep the full v1 envelope and existing database version. Use one read/write
transaction for inspecting eligibility, retiring replaceable history and writing
both new copies. Success requires transaction completion. Any synchronous failure,
request error, budget refusal or transaction abort leaves previous rows intact.
This does not guarantee that the browser can reclaim physical space inside a
transaction: an actual quota failure must still roll back safely.

## Admission policy

- At most 30 ordinary history rows and 64 MiB of serialized UTF-16 JSON across
  that history plus the single `latest` cache row. These are application limits,
  not physical disk usage, free quota or a hard memory bound. The 64 MiB ceiling
  is an initial engineering policy, configurable by the service, not a measured
  universal browser capacity.
- A row is eligible for ordinary rotation only with the known v1 shape, matching
  nonempty owner scope, empty recovery state/copies/separations, explicit nonpending
  metadata and positive central revisions for every entry. Every stored value must
  have matching manifest metadata. The legacy short hash is a consistency veto,
  not an independent central receipt or permission to retire pending work.
- Unknown fields/shapes, missing acknowledgements, prepared writes, other scopes,
  pending entries and recovery payloads are protected. No age-based expiry exists.
- Dedicated Sessions recovery rows are skipped without reading their payloads.
  Sessions rows in `latest` and other stores are untouched and outside this budget.
- The new history row cannot be retired to make its own admission appear successful.
  An individually oversized copy is refused. Unknown existing data exceeding the
  budget is retained; additional copies are refused rather than silently deleted.
- An identical consecutive snapshot with a matching history row creates no data
  and can succeed even if existing history is already above budget. Unknown extra
  recovery fields participate in comparison, so a changed future field is retained.
- If the previous `latest` cache has lost its matching history row and differs from
  the incoming payload, preserve it as a protected orphan in the same transaction.
- Identity collisions fail closed. The scan retains descriptors rather than every
  payload and stops after 4096 examined keys; that refusal also commits nothing.

The standalone pruning API uses the same policy, keeps the current latest backing
row, and refuses without deletion when protected rows prevent compliance.

## Restore boundary

Import previously continued after `saveSnapshot("before-restore")` returned false.
It now stops before any restoration writes, central queueing, import success marker
or reload. Existing recovery review and authorization checks remain in place.
This does not newly certify concurrent multi-tab restore or the entire restore flow.

## Verification and release boundary

Tests cover count and serialized-byte admission, pending/unknown/foreign/recovery
protection, unknown future fields, latest-without-history preservation, duplicate
identity refusal, competing writers, unchanged protected Sessions rows, atomic
rollback after quota/request/put failure, a repeated-edit sequence and reload,
existing deduplication and database version compatibility, snapshot/save-status
separation, and restore refusal when its protective snapshot cannot commit.

The initial ten-case regression run against the old writer failed nine cases;
its existing abort protection passed. Follow-up tests cover additional boundaries.
A synthetic 30 MiB history is also measured without claiming a production SLO.
Final local validation passed: `npm run qa:static` (including `npm run check`,
storage/security guards and architecture budgets), `git diff --check`, 74 API
contracts, 61 Chromium cases and 46 WebKit cases: 181 targeted cases total.
The browser union includes retention/growth/dedup/status, Sessions storage,
database compatibility, Medical working drafts, full-app storage failures,
new-work peer visibility and offline restart/replay. The final synthetic 30 MiB
history replacement took about 94 ms in Chromium and 71 ms in WebKit on this
machine. These single observations are not production latency guarantees.

The old writer failed 9/10 initial targeted regression cases. The existing
unknown-history pruning fixture was deliberately tightened: its 40 metadata-free
rows must now be retained rather than treated as expendable by key alone. This
is an intentional safety-policy change, not a weakened test assertion.

Full repository CI and authenticated staging/production acceptance remain separate.
No percentage or all-module certification follows from these checks.

This candidate follows the storage-growth characterization PR #290. Its baseline
measurement remains a historical observation, not a requirement to keep generating
31 full payload copies. The assertions must accept explicit budget refusal while
proving the latest primary value and pending generation remain untouched.

No staging/main/production release has been started. A direct user release command
and Safe Lane validation are required. PR #291's independent diagnostic change is
not bundled here; its full GitHub QA and CodeQL passed at the final status check.

## Remaining obligations / critique

This is containment, not the complete storage solution. It does not shrink the
underlying localStorage values or remove cross-module full-envelope amplification.
It does not automatically retire historical pending generations when later writes
are accepted: inferring that from a new global sync timestamp would be unsafe.
Protected data can therefore fill the budget and pause future optional snapshots.
Before promoting this candidate, validate that paused state and its recovery path
on representative fixtures; define owner/generation-specific retirement and the
user-visible response. Ordinary snapshot/orphan retention does not itself provide
a newly certified recovery UI. Never present the pause as a successful backup.
The narrower save-status scope correction in PR #289 should also be included in
production acceptance; it remains a separate candidate.

Already open old clients still have the old writer and pruning policy; rollback
restores that policy too. The unchanged data format remains readable, but stronger
retention is not guaranteed while old writers run. Deployment acceptance must
include that boundary and an explicit client-update strategy.

Other journals, browser eviction, localStorage quota, memory-only drafts, central
read visibility, distinct-user conflict handling and all-module acceptance remain
separate obligations. No cache clearing or historical review resolution is part
of this candidate. The live device report remains local and is not published here.
