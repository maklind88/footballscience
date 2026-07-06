# Theme Governance

## Dark Mode Foundation v2

Football Science supports light, dark, and auto theme modes. Dark mode must be treated as a platform-wide design contract, not a per-module afterthought.

The central runtime switch lives in `src/core/platform-shell-runtime.mjs` and stores the selected mode in `football-platform-theme-mode-v1`.

The central visual foundation lives in `platform-theme-foundation.css`. It is loaded after legacy platform styles so shared dark-mode tokens can normalize older module surfaces without rewriting every module at once.

Dark mode must feel like the same Football Science product, not a separate dark-blue skin. The approved direction is a neutral graphite material system with restrained Football Science accents, consistent buttons, readable form controls, and no module-specific palette drift unless a module has a narrow domain accent.

## Rules

- Do not add new hard-coded colors for common UI surfaces.
- Use theme tokens for backgrounds, text, borders, focus rings, status colors, and panel surfaces.
- Keep module-specific accents narrow and readable in both light and dark mode.
- New module CSS should support `body.is-dark-mode` before it is considered complete.
- Avoid one-off dark-mode patches when a shared selector or token can solve the same UI type.
- Do not use a broad `.is-active` selector for theme color. Active state must be scoped to the real control type, for example `.platform-nav-item.is-active`, `.tab-button.is-active`, or `[role="tab"][aria-selected="true"]`.
- Primary actions, selected controls, neutral surfaces, chips, and inputs must use separate tokens. Do not make every active thing look like a primary button.

## Required Tokens

- `--fs-bg`
- `--fs-surface`
- `--fs-surface-soft`
- `--fs-text`
- `--fs-text-muted`
- `--fs-border`
- `--fs-accent`
- `--fs-success`
- `--fs-warning`
- `--fs-danger`

## Extended UI Tokens

- `--fs-page-bg`
- `--fs-panel-bg`
- `--fs-button-bg`
- `--fs-button-primary-bg`
- `--fs-button-selected-bg`
- `--fs-input-bg`
- `--fs-chip-bg`

## Validation

Run the theme audit with:

```bash
npm run theme:audit
```

Run the targeted theme QA with:

```bash
npm run qa:theme
```

For future stricter work, run:

```bash
THEME_GUARD_STRICT=1 npm run theme:audit
```

Strict mode fails when new hard-coded colors are introduced outside `platform-theme-foundation.css`. Existing legacy color debt is tracked so we can reduce it module by module without blocking normal product work.

The dark-mode smoke test walks the major workspaces and checks for readable contrast plus light-surface leaks. When a module fails this test, fix the shared token bridge first. Only add module-specific dark rules when the module has a real visual pattern that the shared contract cannot express.
