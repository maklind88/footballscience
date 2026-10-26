# Saved-work read boundaries: combined candidate, 26 October 2026

Task owner: System / Security. Affected boundaries: Home task notifications
(Home / Dashboard and its existing Chat helper), Platform Shell navigation,
Schedule as a consumer of the shared sync queue, and release QA. Medical changes
are confined to its synthetic acceptance fixture; clinical behavior is unchanged.

Base: `9aadc49223deea5a2c9d9f174fc5e10ea7e39a11` (origin/main at integration).
Branch: `codex/save-read-boundaries-20261026`.

## Final scope

PRs #281, #282 and #283 are combined on current main in separate merge commits,
preserving their original ancestry. Their three product files merged without
conflicts. Full CI exposed a further shared-queue race; that correction is a
separate commit. Four product source files now differ from the base:

- `dashboard-chat-thread-runtime.mjs`: acknowledge only a newly observed eligible
  Home notification. Rendering unchanged Home creates no save intent.
- `workspace-shell-controller.mjs` and `workspace-runtime-composer.mjs`: boot and
  navigation normalize their working view and remember the page locally, without
  publishing shared settings. Explicit settings handlers continue to save.
- `central-sync-runtime-service.mjs`: include Schedule in the existing strict
  read-receipt check for queued and active writes. A confirmed generation is
  retired before a stale retry can send it again at its old base revision.

QA also gains bounded, content-free sign-in/readiness measurements. No database,
API contract, permission, token validation, retry timeout, cache retention or
historical content is changed. Existing server revisions and recovery stores
remain authoritative. This task has not deployed staging or production.

## Schedule read-receipt race

With a request held across token rotation, its late response is correctly rejected
as obsolete and a fresh read follows. That read can confirm the exact Schedule
write, clearing its pending flag and advancing the server revision. A queued or
active retry nevertheless survived because `wasWriteAcknowledgedByRead` admitted
Medical and deletions, but not Schedule. A later queue flush sent the same content
again with the older base revision and received an avoidable conflict.

The initial raw Schedule fixture also mixed receipt reconciliation with legacy
import/event-key normalization. Canonical editor data and a fixed date removed
that ambiguity, but were not a sufficient fix: full CI run 40411605477 reproduced
the duplicate request with byte-identical values. The final correction is in the
shared queue, not a relaxed test assertion.

The existing receipt conditions are retained: matching principal, non-read-only
view, exact raw value and generation fields, cleared durable pending flag, no
prepared newer edit, and a strictly newer confirmed server revision. Schedule is
the only additional admitted module. A deterministic active-receipt contract
failed before the code fix. Seven additional Schedule contract cases cover active
and queued acknowledgements and reject wrong revision, generation, owner, raw
value or read-only view. Existing account/scope and successor protections remain.

## Acceptance fixture corrections

1. The old #283 workspace test expected boot to remove a legacy active page from
   persisted settings. It now proves the correct active page and byte-identical
   local-only settings across boot/navigation/reload, then verifies that an
   explicit settings save excludes the local page and preserves access settings.
2. Central hydration already strips the legacy active page from its local cache.
   The central shell fixture therefore asserts that normalized projection, zero
   POSTs, an unchanged server record and no pending save. Both Chromium and WebKit
   reproduced the original incorrect raw-byte expectation before correction.
3. The Medical private-read fixture had a player absent from Squad. Diagnostics
   showed a roster-archival generation was already pending before the verification
   read, and the unchanged generation was sent during the read. The fixture now
   supplies a consistent Squad roster. It additionally requires no initial Medical
   writes, no initial pending generation, an unchanged full manifest entry/cache,
   and no writes after the production debounce window. No Medical assertion is
   disabled and no clinical product source is modified.

## Validation and evidence

Before final shared-queue correction, 468 distinct scoped cases had passing local
results, but full CI found the Schedule race and Medical fixture mismatch. That
local checkpoint was insufficient to declare the candidate ready.

After the final correction:

- 350 API/contract cases passed, including all 125 shared-sync cases and the seven
  new Schedule cases. The deterministic active-receipt case failed before the fix.
- Both Schedule token-rotation browser variants passed ten times each in Chromium
  (20 runs), retaining exact-one-write and newer-pending-draft assertions.
- 29 Chromium cases passed covering Medical verification/removal safeguards,
  Home cache pressure, settings retries, navigation, and offline peer visibility.
- Both Schedule variants and the full Medical private-read flow passed three times
  each in WebKit (nine runs). Home/shell cases also belong to the persistent WebKit
  saving suite and passed earlier in this integration.
- `npm run qa:static` passed again after the product fix, including syntax,
  storage/security/release guards and architecture budgets. Existing architecture
  size warnings remain. Changed-file syntax and `git diff --check` passed.
- Full CI outcome belongs to PR #287 and its exact final SHA. The failed earlier
  run is retained as evidence; it was not bypassed or relabeled successful.

## Limits

Browser tests use synthetic HTTP state/authentication and real browser storage;
they are not a certification of the actual database or production load. Existing
same-timestamp notification and whole-map conflict limits remain. Concurrent
whole-settings edits retain the existing revision policy. Legacy/raw Schedule
format normalization is not certified by the canonical receipt fixture.

This removes avoidable saves and a confirmed stale-retry race. It does not bound
snapshot growth, eliminate every local review, or complete platform-wide saving
acceptance. Earlier evidence documents describe their original checkpoints; this
document describes the final integration and its additional correction.
