# Synthetic Identity Migration Proof

Owner: System / Security. Scope: test-only executable design model. Squad and Medical retain their identity, selection, clinical and write semantics. FS Desktop APP retains offline client ownership. No other task was activated.

## What Changed

`npm run qa:identity-proof` now exercises a small in-memory PostgreSQL test database through the pinned development dependency `@electric-sql/pglite@0.5.8`. It creates synthetic organizations, teams, identities, membership history, recommendations and migration receipts; parses the fixture SQL; applies the proposed identity-linking model in transactions; exports a database archive; and restores it into a separate in-memory database.

This is NOT a Supabase migration, product adapter, second player master, Medical cutover or offline sync implementation. The fixture schema under `identity_proof` is deliberately separate from the product schema and must never be applied to Supabase. The runner accepts no database URL, credentials, project reference or target path. Existing runtime files and release commands are untouched.

The model uses the existing canonical JSON/hash helper from `scripts/lib/platform-identity-snapshot.mjs`. Sources and membership history are compared without mutation; only synthetic identity links, reference projections and receipts are written. A future real adapter must satisfy these invariants against actual product constraints and permissions rather than copying the fixture schema blindly.

## Acceptance Evidence

| Boundary | Executed proof |
| --- | --- |
| Identity | Reuse exact organization-scoped legacy provenance; equal display names never merge people. Existing IDs survive roster category differences. |
| Historical players | Archived/deleted identities retain those flags; missing historical identities retain references and do not become active squad members. |
| Membership | Active selection, joined/left dates and historical membership rows remain byte-equivalent in canonical JSON. A new team can link the same organization's identities without inventing new active membership. |
| New data | New players and recommendations require a fresh plan and preserve prior canonical IDs. Source revision, content or membership changes invalidate the old plan. |
| Scope | Missing/wrong organization/team fails; matching legacy IDs in different organizations remain distinct; real SQL composite foreign keys reject cross-organization links. This is not an authentication or RLS certification. |
| Incomplete evidence | Missing/duplicate IDs, absent history, unknown archive state and orphan references reject the entire plan. |
| Transaction | An injected error after identity inserts rolls back identity links, projections and receipt together; retry succeeds. |
| Replay | Replaying an accepted operation has no duplicate effect. Reusing its ID with a changed request fails. A changed plan cannot silently replace identity or recommendation content. |
| Synthetic recovery | A database archive restores all seven fixture tables with matching counts/content hashes/revisions/receipts and working uniqueness constraints. A pre-migration restore preserves original history and accepts the exact reviewed retry once, retaining its assigned IDs. |

The proof has 23 tests. It is an explicit, scoped command, not silently added to every UI check or the default Playwright suite. Run it whenever changing this model and as an additional gate for the later identity migration. The existing identity/snapshot/inventory/data-safety contracts remain separate.

## Local Validation

- `npm run qa:identity-proof`: 23/23 passed, including a repeated complete run after review.
- Focused Playwright API contracts: 62/62 passed across foundation review, identity snapshot/command, scale inventory and data-safety contracts.
- `npm run check`, `security:platform`, `storage:guard`, `release:rules`, `architecture:budgets`, `platform:scale:audit` and `git diff --check`: passed. The architecture guard still reports existing oversized module files; none were changed here.
- Locked-dependency `npm audit`: zero reported vulnerabilities at this check, not a guarantee against undiscovered vulnerabilities.
- No full browser suite, production smoke, physical Supabase restore or actual migration was executed. No production-ready/offline-ready claim follows from these results.

## Limits That Still Block Cutover

- PGlite runs PostgreSQL in WebAssembly with a single exclusive connection ([documentation](https://pglite.dev/docs/)). This proves SQL parsing, constraints, transaction rollback and archive restoration for the fixture. It does not prove distributed database contention, multiple connections, Supabase infrastructure or crash recovery under power loss.
- The fixture archive is created and restored through PGlite's documented [`dumpDataDir` / `loadDataDir` API](https://pglite.dev/docs/api). It is not the production physical backup, a production logical export or a test of Supabase restore compatibility.
- No real player, coaching, Medical, pending-journal or Storage object data is included. Production RLS, authorization, backup retention, asset recovery and actual row counts were not exercised here.
- A delayed create is represented as a changed source snapshot, not a functioning offline queue. Client receipts, schema/restore epochs, principal changes, revocation and reconnect against the actual FS Desktop/web adapters still need their own end-to-end proof. Medical remains online-only initially.
- Synthetic full-snapshot hashing and in-memory row matching are acceptance-model conveniences, not the intended million-row query strategy. The real implementation needs bounded reads, indexed scoped identity joins and transaction/version checks for the affected records.
- The real Squad schema permits legacy identity edge cases that this small fixture intentionally rejects. A production adapter must retain the existing audit's ambiguity checks, including historical/deleted matches. It may not assume this fixture's stronger uniqueness constraint already exists in Live.

## Next Safe Action

The actual production recovery exercise remains blocked on an approved isolated destination and controlled access to the chosen backup/export and necessary private assets. Do not use shared staging, change PITR/billing or create a paid restore project implicitly. The local prototype needs no paid service and does not remove those requirements.

After actual recovery evidence, review the additive canonical identity mapping with Squad/Medical boundaries and implement its real database adapter/migration, including SQL/RLS and concurrent-write tests. Keep the old source of truth until comparisons, journal reconciliation and rollback/recovery are proven. See `PLATFORM_IDENTITY_RECOVERY_PLAN_2026-09-11.md` for the real restore checklist and `PLATFORM_SCALE_PROGRAM.md` for the permanent all-module offline contract.
