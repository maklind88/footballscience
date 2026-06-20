# Theme Governance

## Dark Mode Foundation v1

Football Science supports light, dark, and auto theme modes. Dark mode must be treated as a platform-wide design contract, not a per-module afterthought.

The central runtime switch lives in `src/core/platform-shell-runtime.mjs` and stores the selected mode in `football-platform-theme-mode-v1`.

The central visual foundation lives in `platform-theme-foundation.css`. It is loaded after legacy platform styles so shared dark-mode tokens can normalize older module surfaces without rewriting every module at once.

## Rules

- Do not add new hard-coded colors for common UI surfaces.
- Use theme tokens for backgrounds, text, borders, focus rings, status colors, and panel surfaces.
- Keep module-specific accents narrow and readable in both light and dark mode.
- New module CSS should support `body.is-dark-mode` before it is considered complete.
- Avoid one-off dark-mode patches when a shared selector or token can solve the same UI type.

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
