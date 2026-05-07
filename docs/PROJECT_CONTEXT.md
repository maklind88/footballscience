# Project Context

## Vision

Football Science is a long-term coaching platform, not a single simulator page. It should help run a team day to day: plan season and weeks, build sessions, manage staff/users, analyze opponents, define team identity, develop players, and simulate tactical scenarios.

The platform should be built so new modules can be added without breaking existing work. The long-term ambition is to turn it into a downloadable app for App Store and Google Play.

## Product Feel

- Premium, calm, Apple-like layout.
- Clean typography, soft cards, generous spacing, strong hierarchy.
- No unnecessary explanatory copy.
- No cluttered sidebars unless a module explicitly needs one.
- Empty values should usually be visually quiet or blank.
- Admin tools should be powerful but not always visible.

## Collaboration Style

The user wants a decisive building partner. If requirements are clear, implement. If the product direction is blurry, discuss first. The user values realism, coaching logic, and visual quality over quick generic UI.

## Local App Architecture

The current app is a static prototype:

- `index.html`: shell and workspace sections.
- `app.js`: state, rendering, simulator engine, schedule, periodization, session planner, tactical board.
- `styles.css`: platform styling and responsive layout.
- `periodization-import-data.js`: imported planning data.

The app currently uses localStorage for persistence. Future versions should move to real auth and database storage.

## Live Site

- Domain: `footballscience.xyz`
- Hosting: Vercel.
- Deploys are done from the local project with Vercel CLI.

See `docs/DEPLOYMENT.md` before deploying.
