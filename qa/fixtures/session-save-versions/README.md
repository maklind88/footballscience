# Historical Sessions source fixtures

Immutable test-only Git snapshots. `manifest.json` records exact commit and
SHA-256 per source path. JSON values are verbatim original files; do not fix or
modernize them. Capture a new named checkpoint when another version is needed.

`review-aware-20260930` includes the complete five-module browser import closure.
`fixed-version-reader-20260923` intentionally retains the old version-1-only
reader to prove the rollback incompatibility and non-destructive forward recovery.
The loader verifies bytes/dependencies; no Git history is needed in CI.

These fixtures are used only with generated local profiles and synthetic data.
They are not production bundles or permission to roll back a deployed app.
