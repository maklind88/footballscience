# Architecture Size Targets

These targets keep Football Science modular enough to change quickly without sliding back into a huge monolith.

Line counts are guardrails, not a reason to break working behavior. If a file is over target, reduce it through small, reversible extractions with focused tests.

## Recommended Targets

| Area | Good target | Warning level | Hard transition rule |
| --- | ---: | ---: | --- |
| `app.js` | 1-50 lines | above 100 | Must stay a thin loader/shell. |
| `app-runtime.js` | 1,500-3,000 lines | above 5,000-6,000 | Temporary ceiling 16,000 while Phase 2 extracts it. |
| Module `index.mjs` | 50-150 lines | above 250 | Compose/re-export only. |
| Renderer/view file | 150-400 lines | above 500 | Split repeated panels/cards/modals. |
| Controller/actions file | 100-400 lines | above 500 | Split by workflow. |
| Adapter/data-layer file | 100-350 lines | above 500 | Keep API/storage boundaries explicit. |
| Constants/options file | 50-250 lines | above 400 | Keep computed behavior out. |
| Single function | 10-50 lines | above 100 | Review above 300; 500+ is high-risk debt. |
| Module CSS | 150-500 lines | above 700 | Prefer module-owned CSS. |
| Global `styles.css` | under 2,000-4,000 | any new broad global styling | Should shrink over time. |

## Operating Rules

- New product work should go into the smallest appropriate module boundary.
- Do not add product logic back into `app.js`.
- Do not grow `app-runtime.js` unless there is a documented reason and a follow-up extraction plan.
- Existing large files are migration debt, not a pattern to copy.
- If a new file approaches 500 lines, split by responsibility before adding more behavior.
- If a function approaches 100 lines, look for hidden responsibilities before adding more branches.
- Keep protected areas safe: auth, permissions, tenant isolation, central sync, Supabase/API writes, medical writes, chat ownership, simulator/autopilot, and deploy rails need their own safe-lane plans.

## Automated Guard

Run:

```bash
npm run architecture:budgets
```

The guard fails if:

- `app.js` grows above 100 lines.
- `app-runtime.js` grows above the temporary 16,000-line transition ceiling.

It warns about existing module files over 500 lines so we can prioritize future extractions without blocking current safe work.

