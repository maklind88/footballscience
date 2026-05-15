# Security Control Plane

Football Science treats live data as tenant-owned production data. UI state can make the product feel fast, but backend policy must decide what is allowed.

## Contracts

- Permission Matrix: `src/core/permission-matrix.cjs` defines the allowed roles for `read`, `write`, `delete`, `export`, `restore`, `admin`, and `observe` per module.
- API Guard: every public `api/*.js` route must call `guardApiRequest` from `api/_lib/platform-security.js` before doing route work that can read, write, export, restore, or administer data.
- Database Control Plane: `supabase/migrations/20260510030705_platform_security_control_plane.sql` creates `platform_permission_matrix` and `platform_security_events`.
- Release Gate: `npm run security:platform` verifies the matrix, API guard coverage, migration RLS, and tenant-isolation contract.

## Tenant Isolation

Every tenant-owned table must include `organization_id`. Team-scoped records must also include `team_id` unless the table itself is a root tenant/team table. RLS policies must prove one organization cannot read another organization through direct authenticated database access.

Canonical tenant identity starts in `public.platform_organizations`, `public.platform_clubs`, `public.platform_teams`, `public.platform_user_profiles`, `public.platform_memberships`, and `public.platform_tenant_links`. Existing `squad_*`, `chat_*`, and app-state paths remain active until linked and migrated one module at a time.

The platform verifier fails when a new public table is added without tenant scope, RLS, revocation from `anon`/`authenticated`, and an explicit module contract.

## Backend Permission Rule

The browser can hide buttons, but it cannot be trusted to enforce security. Backend routes must check the central permission matrix, and database policies must keep rows scoped to the authenticated user's organization/team.

## Abuse Protection

The API guard applies per-route, per-action rate limits and returns stable `X-RateLimit-*` headers. Login, chat, uploads, central app-state, backup, and restore endpoints have stricter limits than normal reads.

Vercel Firewall/WAF remains the outer layer for volumetric abuse and bot filtering; the in-app API guard is the application layer for identity-aware limits and permission logging.

## Observability

API requests emit structured JSON logs with schema `footballscience-api-security-event-v1`. The logs include route, action, module, actor role, status, duration, and reason for failed requests.

Production incident rules should watch these signals:

- rising `401`, `403`, `429`, and `500` counts
- slow API duration
- failed central saves
- stale backup pointer or failed restore-readiness
- repeated permission denials from the same actor/IP

`Production Incident Alert` opens or updates a GitHub issue when QA on `main`, Supabase migrations, production deploy, production monitor, or rollback fails. This makes failed release and live-health signals visible without exposing secrets or backup content in the alert.

## Required Checks

Run before release:

```bash
npm run security:platform
npm run qa:contracts
npm run qa
```

The release rules intentionally fail if future edits remove the platform security gate from QA.
