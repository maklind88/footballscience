# Local Desktop/Offline Implementation Gate

Date: 2026-09-01

Disposition: **provisionally closed for continued local implementation**. Production readiness remains open.

This report distinguishes implemented behavior, macOS verification, Windows CI verification and physical/manual Windows work. It does not authorize deployment, installer publication, signing or Supabase changes.

## 1. Migration reconciliation matrix

`MIGRATION_RECONCILIATION.md` maps all 60 local migration filenames and SHA-256 values to production and staging history aliases, actual catalog objects, drift classification and future remediation. `MIGRATION_LOCAL_CHECKSUMS.sha256` contains the full immutable local checksums. No remote history, object, row or schema was changed.

## 2. Explanation of 60 / 49 / 48

- Repository: 60 files.
- Production: 49 history rows.
- Staging: 48 history rows.
- Four logical migrations have environment-specific timestamps/aliases.
- Eleven repository files are absent from both remote histories; their objects were checked and classified rather than assumed applied.
- Production contains one active-coach repair absent from staging.
- Matching counts or filenames do not imply matching SQL or catalog state; hotfix, permission, Realtime, index, policy and unsourced-object drift is documented row by row.

## 3. Trusted migration baseline

The trusted future baseline is the reviewed Git logical ledger plus remote catalog evidence. Local Git alone includes unapplied intent; production contains unsourced automation/drift; staging contains an unsourced executable Chat RPC and other drift. Applied history must not be rewritten. Any convergence must be additive, reviewed, owner-approved and first replayed in an isolated database. The current ledger must be accepted before a real sync migration is designed.

## 4. Bootstrap and compatibility contract

Implemented:

- stable bundled bootstrap;
- exact source origin and no redirects;
- native-owned manifest fetch and asset verification;
- frontend build/native app/sync protocol/local-schema/capability checks;
- path, byte-size, content-type and SHA-256 verification;
- exact internal WebView origin;
- nonce-bound health and complete app-ready confirmation before atomic promotion.

Downloaded JavaScript cannot declare itself trusted or compatible.

## 5. Last-known-good evidence

Native app-data holds separate `candidate`, `active` and `previous` generations. On macOS and Windows CI, an incompatible schema-999 candidate failed closed, active `hosted-spike-v11` remained usable, and restart while the bad source remained reachable loaded the active generation and local projection. Compatible source recovery did not replace the running healthy generation unexpectedly.

Native timeout/quarantine for a compatible candidate that never reaches app-ready is implemented and verified locally on macOS and in Windows CI. Real-shell and physical-device behavior remain later gates.

## 6. Browser/PWA/service-worker regression

Desktop uses `fs-desktop-native-shell-cache-v2`, not Cache Storage or a desktop service worker. Existing web/PWA/push-worker sources were not changed. Local full mandatory QA passed with 2,525 tests passed, one intentional skip and zero failures. Windows run `33499616167` passed static/security gates, API contracts and all four Chromium shards on the exact pushed branch commit. This preserves the existing web platform and separates desktop rollback from browser cache lifecycle.

## 7. Local Session Planner projection

SQLite schema v3 normalizes one explicitly selected session: metadata, ordered blocks, stable player references, exercise references and tenant/organization/team partition. It excludes the approximately 3.10 MB canonical planner document, unrelated sessions, blobs/video, medical data, credentials, tokens, signed URLs and authenticated response caches. The packaged Candidate A UI can rename the session and set block duration through typed revisioned operations; Candidate B and recovery remain non-mutating.

## 8. Outbox and acknowledgement schemas

`session_outbox` stores immutable operation ID/type/version, client and synthetic actor, partition/tenant/org/team, entity, base/result revision, typed payload hash, timestamps, state and attempts. Projection mutation plus outbox insertion is one `IMMEDIATE` transaction. `operation_receipts` is durably inserted in the same transaction that deletes the outbox item. Reuse of an operation ID with different content fails closed.

## 9. Restart and lost-ack recovery

Tests prove projection/outbox close-reopen persistence, stale-revision rollback, acknowledgement-before-delete, server-accepted/client-response-lost recovery, deterministic `already-applied` replay after restart and preservation of pending work on unauthorized-partition rejection. Windows CI separately proves process restart of the native shell generation and local read projection. A real server crash matrix remains future work.

## 10. SessionAuthority and token flow

Implemented now: a synthetic native `SessionAuthority` contract returns actor, org, team, partition, auth epoch and a bounded 24-hour offline lease. It does not read browser `localStorage`; SQLite has no refresh-token column.

Future token flow:

```text
Verified hosted shell
        |
        | typed native request; never refresh token
        v
Native SessionAuthority (single refresh owner)
        |
        +--> macOS Keychain / Windows Credential Manager
        |        stores the only refresh credential copy
        |
        +--> short-lived access-token broker
                 |
                 +--> authenticated FS/Vercel API
                           |
                           +--> private server-side Supabase access
```

Logout, account switch, token rotation, revocation and lease expiry are implemented against synthetic authority/credential adapters and block or quarantine synchronization without deleting pending work. Real provider callbacks, owner-approved lease policy and physical Windows Credential Manager verification remain open.

## 11. Synchronization boundary recommendation

Use one narrow authenticated Vercel handler as the public desktop sync boundary. The branch contains a fail-closed local handler contract and private additive Postgres draft verified only in disposable PGlite; neither has a real adapter or deployment. Direct desktop Supabase RPC is only a conditional fallback if it preserves equivalent authorization, observability and version isolation. A new service is not justified.

## 12. Open risks

Must fix before production: real secure auth, membership revocation/offline lease policy, local encryption/purge/device-loss policy, reviewed backend transaction, real conflict/rebase behavior, physical Windows, installers/signing/updates/SmartScreen and real network/sleep/restart behavior.

Should fix during the next local phase: an authorized non-production sync adapter, conflict review/rebase UX, bounded retry controls, deterministic provider-backed account-switch cleanup, more crash/fault injection and production-shell compatibility fixtures. Raw outbox inspection should not be exposed to downloaded frontend code.

Can wait: Candidate C and broad offline coverage. Should not be done: whole-document replication, generic SQL/filesystem/HTTP bridge, medical-data offline caching, refresh token in SQLite/localStorage or a second feature-equivalent Candidate B UI.

## 13. Candidate B archive decision

Candidate B passed packaged macOS and Windows CI startup without a network dependency. It remains viable and rebuildable evidence, but is not kept feature-equivalent because doing so creates native-release friction and web/desktop drift. Reopen it only if physical Windows, real-shell security or LKG evidence materially invalidates Candidate A.

## 14. macOS, Windows CI and physical gaps

| Claim | State |
| --- | --- |
| Candidate A packaged startup/restart/reconnect/LKG | Verified locally on macOS |
| Candidate B packaged fallback startup | Verified locally on macOS |
| Candidate A/B x64 release compile and WebView2 startup | Verified through Windows CI |
| Native cache restart, synthetic transitions, LKG and origin/command denial | Verified through Windows CI |
| Installer UX, sleep/wake, real network switching, Credential Manager, updates, SmartScreen, physical restart | Still requires physical/manual Windows verification |
| Real auth, backend sync and production data behavior | Not implemented or verified |

## 15. Exact next backend changes — proposal only

After ledger approval and separate authorization, prepare reviewed additive changes in an isolated environment:

1. Normalize the bounded selected-session entities with stable IDs, tenant/team ownership, authoritative revision and archive/tombstone state; do not import the entire 3.10 MB document contract.
2. Add a server-only immutable operation/idempotency ledger keyed by actor/client/operation ID with payload binding, result and retention policy.
3. Add one private transactional apply routine that validates server-derived scope, operation/version allowlist, base revision and immutable replay before changing data and returning `accepted`/`already-applied`/`conflict`.
4. Add a selected-session snapshot/change-cursor read contract and deterministic rebase inputs.
5. Add minimal grants and intentional RLS; desktop receives no service-role key and no generic table writes.
6. Add the authenticated, rate-limited Vercel route with payload bounds, request correlation and sanitized logging.
7. Add cross-tenant, stale-revision, replay-with-different-content, revoked-user, malformed-payload, partial-failure and retry tests.
8. Reconcile with existing app-state history/audit and conversion paths so the current web platform remains canonical throughout rollout.

These are proposed next changes, not created migrations or remote actions.

## Gate conclusion

Candidate A is sufficiently evidenced to continue local implementation of the first slice. Candidate B is a viable fallback. The architecture gate is provisionally closed only at that scope. Physical Windows and all production-facing auth, backend, schema, installer and release work remain explicit later gates.
