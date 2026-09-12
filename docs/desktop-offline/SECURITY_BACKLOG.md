# Desktop and Offline Security Backlog

Updated: 2026-08-31

These findings are deliberately separated from local Candidate A and offline-projection implementation. None authorizes a remote change.

## SEC-DESKTOP-001 — staging leaked-password protection disabled

- Environment: Football Science Staging (`pokrksgempkuraueglpu`)
- Source: Supabase staging Auth/security advisor, read-only audit
- State: open
- Severity: medium defense-in-depth backlog
- Risk: staging password changes may accept passwords known to appear in breach corpora.
- Required future action: enable and verify leaked-password protection through a separately authorized staging Auth configuration change; test login/reset behavior and document rollback.
- Current phase: not changed and not a blocker for local synthetic desktop/offline work.

## SEC-DESKTOP-002 — staging-only unsourced Chat write function

- Environment: Football Science Staging (`pokrksgempkuraueglpu`)
- Object: `public.upsert_chat_read_receipt(uuid, uuid, uuid, uuid, uuid, timestamptz)`
- State: open; must be resolved before staging becomes a trusted migration baseline
- Severity: high governance/security review
- Evidence: function exists only in staging, is absent from Git migration files, and currently reports EXECUTE for `anon`, `authenticated`, and `service_role`.
- Risk: the function writes caller-supplied user and tenant identifiers. RLS may still restrict effects, but its authorization boundary and intended ownership are not source-controlled.
- Required future action: inspect call paths and role behavior in an isolated test, then either add a reviewed, tenant-validating source migration or revoke/drop it through a separately authorized Safe Lane change.
- Current phase: not called, not changed, and excluded from the synthetic synchronization design.

## SEC-DESKTOP-003 — production-only unsourced RLS event trigger

- Environment: Football Science NCC (`bustidorxevacosqhkcz`)
- Objects: `public.rls_auto_enable()` and event trigger `ensure_rls`
- State: open governance item
- Severity: medium
- Evidence: production-only, absent from Git migrations; automatically enables RLS after public table creation.
- Risk: the safety intent is positive, but unsourced DDL automation can make production and clean replay behave differently and can conceal incomplete table policies/grants.
- Required future action: decide whether this is an accepted platform control, document/source it additively if accepted, and verify behavior on an isolated database.
- Current phase: not changed and not relied on by the local offline architecture.
