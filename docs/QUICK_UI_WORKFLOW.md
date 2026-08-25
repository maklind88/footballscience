# Quick UI Workflow

Current operating model: `distributed-specialist-v3` (2026-08-24).

This workflow exists so small visible changes can move quickly while Football Science is under heavy development.

## When To Use

Use the Fast UI Lane for narrow visible changes:

- copy/text
- spacing/alignment
- section order or visibility
- simple CSS polish
- marked Live elements where the selector/component is clear
- UI-only renderer changes that do not alter saved data contracts

Do not use it for auth, permissions, app-state/data, Supabase/API, backup/restore, migrations, secrets, security, or broad multi-module behavior.

## Commands

```bash
npm run quick:ui
```

Runs a small validation pass:

- `git diff --check`
- syntax checks for changed JS/CJS/MJS files
- risky-path detection so API/Supabase/security work stays in the Safe Lane

```bash
npm run deploy:ui
```

Deploys a clean committed UI-only change quickly:

- supports a clean isolated specialist branch
- rebases from latest `origin/main`
- runs `npm run quick:ui`
- safely fast-forwards the exact verified SHA to `origin/main`
- checks active release traffic
- deploys that same SHA through Vercel CLI
- runs production postdeploy verification

GitHub QA can continue in the background for these small UI deploys.

## Sequential Deploy Ownership

There is no permanent central Live/deploy owner. The specialist chat that owns the UI task executes deploy and production verification only after a direct user `Deploy`, `Deploy fast`, `Deploy safe`, or standalone `Live` instruction in that chat.

Product intent and cross-chat delegations do not activate `npm run deploy`, `npm run deploy:ui`, staging, main integration, or production release work.

Only one full release command should run at a time. `npm run deploy`, `npm run deploy:ui`, and `npm run deploy:safe` must acquire the shared Football Science release lock before validation and hold it through production verification. A second specialist waits automatically with visible owner/status information. Targeted development checks can still run in parallel in isolated worktrees.

## Marked Live Changes

When the user marks an element on Live and asks for a visual change, use the marker as the product target:

- go directly to the selector/component/module when clear
- avoid broad platform analysis for tiny visual changes
- apply same-type changes centrally through shared classes/renderers where possible
- stop if the marked module is owned by another active chat

## Modular UI Direction

Repeatedly edited UI should move into smaller module files over time. Tiny legacy fixes can stay narrow, but if the same pattern keeps changing, extract the renderer/style into `src/modules/<module>/...` or a dedicated stylesheet.
