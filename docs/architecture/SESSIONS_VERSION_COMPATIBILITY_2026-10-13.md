# Sessions client-version and local-schema acceptance, 13 October 2026

Owner: System / Security (shared durability, compatibility and QA). Sessions
retains ownership of session/block semantics, writes and review choices.
No module runtime, API, schema definition, permissions, release command or live
record is changed. This extends the local QA-only candidate
`codex/sessions-restart-acceptance-20261012`, following `2c58f385`.
Current product source: `8f2333d58deee481c1fcff846931f8e84d4ab202`.

## Decision and version selection

The previous production `56063c14487d0821ea1b87400ec570abfeb66d6d` and released
`8f2333d5` have byte-identical Sessions client, store, protocol, dependency helper
and local database connection files. Switching those two alone would provide
little evidence about older client compatibility. No new Sessions wire/storage
format was introduced by the Medical release.

Use actual Git source snapshots for a wider, explicitly bounded comparison:

| Source | Role | What was loaded |
| --- | --- | --- |
| Current `8f2333d5` product source | Current reader/writer | Actual checkout modules |
| `0df86782fe27a5633c9b778b16bcfbef58d83be4` | Historical review-aware client | All five transitive browser modules, byte-exact |
| `778f55fa7271040eebe6789a038a317da108ac93` | Pre-compatibility negative control | Old fixed-version store reader in isolation |

The five-module historical closure contains client, store, protocol, dependency
helper and database connection. Fixture JSON preserves exact source bytes, with
SHA-256 manifest and immutable Git provenance. The loader validates hashes and
relative dependencies; the browser asserts every historical file was requested
and the actual historical public API is present. No current dependency is
silently substituted behind the historical client. Snapshots are test data,
not a second production implementation, and work with shallow CI checkouts.
All six stored source files were compared directly with `git show` before commit.

## Results

Four scenarios pass in Chromium and WebKit using real persistent profiles and
IndexedDB. No storageState transfer or reinjection of saved journal rows occurs.
The existing schema owner creates the real version-2 operation store; there is
no manual alteration of production schema definitions.

1. Historical writer -> current reader/writer -> historical reader, with both a
   pending independent edit and a conflicting review row. The pending edit syncs
   exactly; the conflict remains. Explicit Keep central archives only that review.
2. Current writer -> historical reader/writer -> current reader, with the same
   pending/review requirements. Both directions preserve an unrelated operation
   in the newer shared store, including its exact value and database version.
3. The fixed-version reader raises **VersionError** against database version 2.
   Returning to current source reveals the exact pending row, projects its work
   and syncs successfully. No cache deletion, downgrade or rescue rewrite is used.
4. Current and historical tabs remain open during the real v1 -> v2 upgrade.
   The old connection releases/reopens, both writers retain distinct immutable
   rows, and replay combines independent fields with their own receipts.

The negative control is a known historical incompatibility, not a new defect in
current production. A green test intentionally confirms that the old reader is
incompatible and forward recovery retains data. Do not label that old target a
safe rollback or describe its inaccessible data as deleted.

The first negative-control test expected a projected document without its
canonical empty date tombstones. The actual journal was byte-identical, but the
view included the normal empty tombstone map. The assertion now checks the full
explicit canonical object; no product code or journal assertion was relaxed.

## Verified and unresolved boundaries

| Boundary | Evidence / decision |
| --- | --- |
| Pending/review compatibility for the selected pair | Passed both directions after browser restart and shared schema upgrade |
| Old/new concurrent tabs | Passed selected pair, independent fields, real IDB connection upgrade |
| Unrelated newer-store contents | Preserved exactly through both round trips |
| Pre-compatibility rollback | Rejected reader access with VersionError; forward recovery passed |
| Full application rollback | Not certified: shell/auth/service worker/cache activation and other modules are outside the harness |
| Arbitrary old/future versions | Not certified; no universal oldest-supported version inferred |
| Real server migrations/receipt audit | Not tested here; revision/receipt server is synthetic and fixed to current semantics |
| Unexpected process kill, power loss, eviction | Still separate; graceful profile closure and explicit transaction abort are complementary evidence |

Operational implication: a rollback must review client/local-schema compatibility
as well as server compatibility. For the observed old fixed-version reader,
prefer a compatible forward recovery; do not purge local work to regain access.
The release rollback rail is unchanged by this QA-only checkpoint. This document
records an acceptance requirement, not a newly enforced automatic deploy block.

## Validation

- Chromium: 15 passed, no skips (four version transitions, four prior restart
  cases and seven existing local database compatibility cases).
- WebKit: the same 15 passed, no skips.
- Exact historical Git bytes and manifest hashes verified for all six files.
- New/helper JavaScript syntax and `git diff --check` are checked before commit.
- `npm run qa:static` passed, including security, storage, release rules and
  architecture guards. The 84 existing oversized-module warnings remain; no
  budgets were changed.

Reproduction:

```sh
npx playwright test --config=qa/playwright.config.mjs --project=chromium qa/session-version-transition.smoke.spec.mjs qa/session-browser-restart.smoke.spec.mjs qa/local-database-compatibility.smoke.spec.mjs
npx playwright test --config=qa/playwright.save-webkit.config.mjs qa/session-version-transition.smoke.spec.mjs qa/session-browser-restart.smoke.spec.mjs qa/local-database-compatibility.smoke.spec.mjs
npm run qa:static
```

No new staging/production release, main integration, remote CI or real-user data
mutation is part of this checkpoint. Next: actual interrupted browser processes
around local commit and server acknowledgement, followed by the remaining full
application failure matrix. Sessions and the platform remain partially certified.

## Follow-up: process-crash evidence

The subsequent [Chromium crash checkpoint](SESSIONS_CRASH_ACCEPTANCE_2026-10-13.md)
verifies five local transaction/receipt boundaries with the actual browser crash
command. It complements the graceful historical-version matrix; it does not
certify crashes during arbitrary historical upgrades, OS power loss or eviction.
