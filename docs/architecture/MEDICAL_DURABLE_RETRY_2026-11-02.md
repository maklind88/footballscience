# Medical: explicit durable retry after cache failure

## Ownership, scope and current decision

Task/release owner: System / Security, continuing the user-assigned saving
reliability work. Affected owners/boundaries: Medical Room (existing recovery
UI and local copy contract), System / Security (authenticated app-state write
boundary and route). Medical clinical merge rules, permissions, source data,
Supabase schema and database RPC are unchanged. No other specialist work is
bundled. This checkpoint is a local candidate; it has no deploy authorization.

Branch: `codex/medical-durable-retry-20261102`, based on
`0470a74414d518bfd37b63c7e65a04db0eb3e18b` from current `origin/main`.
The Sessions candidate `d8a5371b67d7b9d6b8fe445475c0786c3dc5b02c` and earlier
snapshot-budget candidates remain separate, not prerequisites of this change.

The previous audit found that Medical already stores recovery copies independently
of localStorage, but they cannot be retried centrally after reload. They are
whole-state rescue copies, not the immutable operation journal used by Sessions.
Blindly replaying them would be unsafe: the ordinary Medical endpoint may merge
stale whole-state writes using existing clinical timestamp rules. A generic queue
flag or a fresh read alone cannot protect the race between reading and writing.

This checkpoint supplies a guarded, user-initiated retry for newly retained copies.
It deliberately does not claim automatic offline delivery or final resolution of
the platform's storage problem. The next automatic queue needs module-owned edit
intent/conflict semantics; it must not relabel historical rescue snapshots.

## Implemented behavior

1. New failed Medical saves opt into `medical-recovery-retry-v1` when retaining
   their copy. Existing IndexedDB transactions, bounded capacity, owner scope,
   exact value and previous value remain the durability mechanism. Retry context
   is bound to the actual state object returned by an authorized read; a later
   cache/metadata read cannot lend a newer version to an older editor. Missing
   read context produces a review-only copy. Historical
   copies remain unmarked; deduplication cannot upgrade them. No schema upgrade,
   cleanup or automatic historical replay is introduced.
2. After the copy commits and can be read, its Recovery panel offers **Retry
   central saving**. Memory-only copies must first use the existing local retry
   or download. Copies without a verified positive base revision remain review-only.
3. The action rereads the selected immutable copy, verifies current scope/access
   and editor generation, then performs a fresh private server read. It blocks
   if the original central revision or clinical baseline differs. Only the two
   established tab-local selections (`selectedDate`, `selectedPlayerId`) are
   excluded from the baseline comparison; every other field remains significant.
4. If that whole copy already matches the fresh central value, the action confirms
   it without POSTing. This handles an earlier committed write whose reply was lost.
5. Otherwise the dedicated `/api/medical-recovery-save` route sends one copy with
   its original revision. The server performs existing authorization and rejects
   stale/future/missing revisions before writing. Database mode is mandatory;
   existing atomic revision comparison also rejects a concurrent intervening write.
   The route rejects bulk writes, deletions and another module's key.
6. A write acknowledgement must match the copy ID, protocol, full submitted value
   and expected next revision. Scope/token/access/generation changes or a timeout
   invalidate the result. The status applies to that selected copy only, never a
   newer draft or a global saved indicator. Successful retry requests the existing
   scoped central read (without force-apply) so the work can become visible; a
   newer pending edit still follows the existing read/working-copy protections.
7. The local copy remains available. Existing explicit exact-copy verification and
   retirement remain separate. A failed/reviewed copy is never deleted automatically.

The separate route is a Vercel rewrite to the existing authenticated app-state
handler, not a new server function. Older deployments do not define it. This
prevents a rollback between preflight GET and POST from silently interpreting a
new retry as an ordinary legacy whole-state save. The fresh read also advertises
capability only for a private Medical response in database mode. Actual deployed
routing remains a release-verification obligation.

## Verification and findings

- The full API-contract suite passed 3,718 cases. After the final read-context
  binding, 100 focused Medical contracts passed, including the new regression;
  its strengthened separate-read assertion also passed independently.
- The final browser candidate passed 60 Chromium and 60 WebKit cases. These cover
  normal Medical saves, durable recovery/retry, immediate read visibility,
  reload, conflicts, lost replies, changed access, export and explicit retirement.
- Full `npm run qa:static` passed after the final product change: local isolation,
  syntax, release rules, incident readiness, storage and interaction policy,
  platform security/readiness, migration guards, performance and architecture.
  Existing architecture warnings remain; no new guard failures were introduced.
- Explicit syntax checks cover the new helpers and tests; `git diff --check` passed.
- No staging/main integration, live authentication, production writes or deploy
  commands were run. A passing local candidate does not establish deployed proof.

Initial tests and final review exposed issues before completion:
- The API fixture's fresh-handler factory was scoped to a different test; the new
  endpoint tests now create their own fresh instance.
- The first full-app baseline comparison falsely treated a stripped tab-local
  selection as clinical divergence. The fix ignores exactly the two existing UI
  fields; unknown/clinical fields and version differences still block retry.
- A regression demonstrated that recovery needed the editor's original read
  context, rather than current cache metadata. It failed before the read-object
  binding and passed afterward, including a separate newer read that was not
  adopted by the older editor.
- One WebKit run reused the parallel API runner's local test server. The API
  runner stopped that server on exit, causing seven connection failures. Final
  browser runs use their own port and run sequentially.

The new full-app cases use actual Medical runtime, scoped IndexedDB and synthetic
HTTP/auth. Both Medical cache and shared metadata writes fail. They persist new
work, reload the app, select its saved copy, retry and reread the accepted work.
Peer changes before/during retry remain untouched. A lost reply is reconciled
without a second write. API cases invoke the actual handler with an atomic-CAS
fetch fixture, including a database race after the server read; they are not live
Supabase tests. No real clinical records are accessed or modified.

## Limits and subsequent work

- This is explicit retry for newly retained failed saves, not an automatic durable
  pending queue for every Medical save. Ordinary saving still uses the existing
  localStorage/shared sync route. Other modules are not certified by this work.
- Historical recovery copies are unchanged and cannot gain retry capability through
  deduplication. No historical records are repaired or retrospectively replayed.
- A changed baseline, a missing base revision or first-ever absent central state
  requires review. There is no new client-side clinical merge or override button.
- Automatic reconciliation, record-level conflicts, journal growth/retention,
  old/new client coexistence and full process-crash acceptance remain open.
- The current copy store retains its 128-copy/32 MiB budget. This change does not
  solve its long-term growth. No eviction guarantee is made for browser storage.
- When both durable local storage and central saving fail, only the existing
  memory/export recovery remains. Closing that tab can lose uncommitted work.
- Production routing, authenticated two-user acceptance and the full Safe Lane
  release are required before this candidate can be called production-verified.

The Supabase skill was read for the server boundary; its current changelog was
checked. No Supabase API upgrade, SQL, RLS change, migration or credential change
is involved. The existing database comparison operation is reused and tested.
