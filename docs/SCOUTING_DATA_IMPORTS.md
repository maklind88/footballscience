# Scouting Data Imports

This contract separates player data updates from application code releases. The implementation is staged locally until its Supabase migration, environment checks, Safe Lane, and production verification are explicitly authorized.

## Source Of Truth

- The uploaded workbook is an immutable source artifact in the private `footballscience-scouting-imports` bucket.
- A checksum and import definition identify one deterministic dataset version.
- Staged rows are not visible to Scouting users.
- Exactly one validated dataset version is active for a scope.
- The previous version remains restorable.
- Favorites, lists, reports, contacts, and Shadow XI remain independent workflow data.

`scouting-import-data.js` is a transition fallback, not a parallel write owner.

## Admin Workflow

1. Platform Admin selects a supported source file in Scouting settings.
2. The browser hashes the source and parses Excel in a Worker.
3. The admin reviews column mapping and a local change preview.
4. The API creates or reuses a private immutable source artifact and verifies its server-side checksum.
5. Normalized rows and metrics are staged in bounded, idempotent chunks.
6. Server validation compares exact row and metric counts, structural blockers, total retention, and league-season retention.
7. A validated version requires a second explicit Publish action.
8. Publication switches the complete player dataset in one database transaction.
9. Version history can restore a previous validated dataset after confirmation.

## Safety Rules

- Only Platform Admin may create, stage, validate, publish, or restore datasets.
- The API route and service-role functions own all database writes.
- Source files are private, size-limited, MIME-checked, checksum-verified, and quarantined on mismatch.
- Missing rows, missing metrics, structurally invalid rows, a dataset loss above 35%, or a league-season loss of at least 50% block publication.
- Stable source identities and FSDB crosswalks are resolved in batches before staging.
- Every version is idempotent by the SHA-256 of the source checksum plus its import definition.
- Publication and rollback are atomic and audited.
- A cancelled or stale browser request must not update the visible workspace.

## Read Migration

The browser asks `/api/scouting?action=status` for capability before choosing a source.

1. Active versioned server data is preferred.
2. Existing server rows are accepted during the transition.
3. The generated bundled dataset is used only when the server is unavailable or has no published rows.

The generated fallback is removed only after row counts, sample players, filters, profiles, Squad/IDP spiders, rollback, and authenticated browser flows match the active server version.

## Release Requirements

This change affects live data, Supabase, API behavior, and source of truth, so it always uses Safe Lane. Before release:

- apply and verify the migration in an isolated Supabase environment;
- run syntax, Scouting contracts, Supabase, permission, security, architecture, and browser suites;
- import a production-shaped workbook into staging and inspect the preview and validation summary;
- prove publish and rollback with no loss of workflow data;
- verify desktop and mobile performance with the full dataset;
- deploy only from a clean isolated branch when the user authorizes Live.
