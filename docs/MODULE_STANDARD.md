# Module Standard v1

This platform is moving from a large legacy `app.js` into smaller module-owned surfaces. The migration must be boring, reversible, and safe for Live.

## Source Of Truth

The coded standard lives in `src/core/module-standard.mjs`.

Every existing module must have a Module Standard contract with:

- stable `id`
- `migrationStatus`
- `mountId`
- current file evidence
- target module folder and target file slots
- QA evidence
- migration guard flags
- extraction order
- risk level

The QA guard is `qa/module-standard.api.spec.mjs`. It must pass before a module extraction is considered safe.

## Required File Shape

Every future extracted module should follow this shape:

```text
src/modules/<module>/
├── index.mjs
├── <module>-renderer.mjs
├── <module>-state.mjs
├── <module>-actions.mjs
├── <module>-adapter.mjs
└── <module>.css

qa/<module>-module-contract.api.spec.mjs
```

Modules can have extra files when useful, but these slots define the baseline.

## Migration Statuses

- `core`: platform shell or generated core health/identity surface.
- `legacy`: mostly still inside `app.js` or legacy top-level files.
- `legacy-adapter`: still rendered by legacy code, but has a safe adapter boundary.
- `partial-extraction`: meaningful code already lives in `src/modules`, but legacy glue remains.
- `extracted`: renderer/state/actions/adapters live in the module folder and app shell only loads it.
- `database-primary`: the module foundation is server/database-owned.

## Safety Rules

During extraction:

- Keep existing storage keys.
- Keep the current write path until a server-side migration is explicit.
- Never hard-delete or seed-overwrite user content.
- Keep `/api/app-state` as the central save pipeline for app-state modules.
- Add before/after QA for the module being moved.
- Do not change permissions, tenant scope, or data contracts just because UI code moves.
- Leave `app.js` as the shell until the module is fully proven.

## Current Extraction Order

The coded queue is available through `moduleStandardRegistry.extractionQueue()`.

Practical order:

1. Platform identity/readiness/appearance contracts stay first as guardrails.
2. Home and Chat boundaries stay stable.
3. Schedule is the first normal UI extraction target and is now partially extracted into state/actions/renderer files.
4. Periodization follows Schedule.
5. Squad / Player Profiles comes before Medical.
6. Medical follows Squad/Profile.
7. Exercise Library comes before Session Planner.
8. Session Planner is split into smaller passes.
9. Gameplan, Football Science DB, Scouting, Transfer Room, and Game Simulator follow their own risk gates.

## How To Extract A Module

1. Add or update the Module Standard contract.
2. Add a read-only adapter if the module is still legacy.
3. Move pure helpers first.
4. Move state normalization next.
5. Move rendering after state is stable.
6. Move actions/events after rendering is proven.
7. Move CSS last or alongside the renderer if isolated.
8. Run the module contract test and targeted smoke.
9. Only deploy when the user explicitly requests it.
