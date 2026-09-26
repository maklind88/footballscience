# Tacticalboard tools: 2026-09-25

## Scope

Candidate branch: `codex/tactical-tools-stability-20260925`, based on `d5bc7ee3`.
This task owns the Tacticalboard editor changes requested in the Sessions chat.
No release has been authorized for this candidate.

- Override generic button hover transforms on rotation and endpoint handles.
- Preserve the pointer's initial grip offset when resizing or rotating.
- Restore canvas/layout scroll positions after redraw and use current canvas geometry.
- Do not persist a handle/selection click that did not move anything.
- Use minimum width (0.25) for new-tool defaults only. Saved/compact missing-width
  semantics remain 1.1. No storage schema, frame limit, or sync changes.
- Retain all 23 tools with untruncated labels and responsive columns.
- Use the same scalable football artwork in the palette, editor, preview and print.
- Make metric labels legible and preserve colour swatches in dark mode.

## Validation

`npm run quick:ui` passes. Run scoped Playwright checks on an isolated QA port:

```sh
QA_PORT=4391 npx playwright test --config=qa/playwright.config.mjs \
  qa/session-planner-tactical-tools.smoke.spec.mjs \
  qa/session-planner-tactical-controller-contract.api.spec.mjs \
  qa/session-planner-tactical-helpers-contract.api.spec.mjs \
  qa/session-planner-module-contract.api.spec.mjs \
  qa/session-tactical-storage.api.spec.mjs \
  qa/session-planner-frame-capacity.smoke.spec.mjs \
  qa/session-planner-tactical-playback.smoke.spec.mjs \
  qa/session-planner-readonly-playback.smoke.spec.mjs \
  qa/session-planner-tactical-roster.smoke.spec.mjs
```

The regression set passed 83 tests before the final dark-theme check was added.
The tools suite is rerun after final CSS changes, covering five pitch modes,
off-centre dragging, stationary clicks, undo/redo, reload, desktop/mobile label
layout, print artwork and dark-mode contrast. All nine tests pass.

## Release Boundary

No production data was edited. Production was inspected read-only; modifications
and saved exercises used for testing exist only in local test contexts.
Receipt-recovery/Sessions API work and the primary dirty Video Analysis worktree
are deliberately excluded. Recheck the current main diff before an authorized release.
No backend, migration, authentication, or central-save reliability claim is made here.
