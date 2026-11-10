# Local Offline/Reconnect Vertical Slice Evidence

Date: 2026-08-31

Status: passed locally on macOS with synthetic identities and football data only. No remote environment was contacted or modified.

## Components exercised

- authenticated local Vercel-handler contract at `/api/desktop-session-sync`;
- private `SECURITY DEFINER` Postgres read/apply routines under the exact `fs_desktop_sync_executor` role;
- disposable in-memory PGlite Postgres initialized from the reviewed synthetic catalog and additive SQL draft;
- file-backed SQLite local projection, two-operation outbox, durable receipts and quarantine sidecar;
- Candidate A offline UI controller for the two typed writes plus bounded synchronization-state presentation;
- browser-mode DesktopBridge fallback with no native capabilities.

PGlite runs the Postgres engine locally as WASM. It is suitable deterministic database evidence for this gate, but it is not a claim that Supabase platform services, pooled production connections or remote deployment were exercised.

## Proven sequence

1. A synthetic active coach is authenticated by the injected local auth boundary.
2. The server derives that actor's organization/team.
3. The selected synthetic session is read through the private Postgres snapshot routine.
4. The bounded response is normalized into a file-backed SQLite projection.
5. SQLite is closed.
6. SQLite reopens with no server dependency.
7. The selected session remains readable.
8. `session.rename` and `block.duration.set` are applied offline.
9. Each projection change and outbox insert commits atomically.
10. SQLite closes and reopens again.
11. Revision 9, both edits and two pending operations remain.
12. The synthetic connection returns.
13. The first immutable operation is submitted.
14. Postgres applies it once and records its acknowledgement atomically.
15. The client deliberately loses that response, restarts and replays; Postgres returns `already-applied` with the original acknowledgement ID.
16. The second operation advances the authoritative revision to 9.
17. Each acknowledgement is inserted into SQLite first.
18. A test assertion confirms both receipt and outbox row exist before the row is removed in the same durable transaction.
19. Browser delivery still reports runtime `browser` and exposes no native mutation path.
20. Cross-tenant and revoked-user requests fail; the authoritative session and canonical app-state remain unchanged.

Final local state: zero outbox rows, two durable receipts, authoritative session revision 9, expected renamed title and block duration, and canonical `football-session-planner-v3` revision 7 unchanged.

## Negative and recovery coverage

- exact operation replay;
- operation-ID reuse with changed payload;
- stale base revision conflict without mutation;
- malformed/unsupported operation payload;
- cross-tenant scope;
- revoked membership;
- partial-failure rollback;
- accepted server write with lost client response;
- process restart before and after offline edits;
- expired lease preserving pending work;
- authorization quarantine preserving pending work;
- no refresh/access token fields in SQLite schema, receipts, outbox or browser storage.

## UI/native boundary evidence

Focused frontend contracts verify that rename and duration edits use the current local revision, immutable UUID operation IDs and the credential-free native context. Invalid values never cross the bridge. Native Rust tests verify the same operations commit projection and outbox together, persist across close/reopen and report only bounded synchronization state. The packaged macOS application booted the signed writable asset set and completed its online/offline/restart cycle. This is not a claim of physical UI clicking, real authentication or remote synchronization.
