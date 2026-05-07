# QA Checklist

Use this before saying a change is done.

## Static Checks

- Run the automated gate before deploy:

```bash
npm run qa
```

- For narrower checks:
  - `npm run check` validates `app.js` syntax.
  - `npm run qa:api` validates serverless API contracts.
  - `npm run qa:browser` validates critical local browser flows.
  - `npm run qa:live` runs the optional production smoke if `LIVE_QA_USERNAME` and `LIVE_QA_PASSWORD` are set.
- If `index.html` auth script changes, parse-check the inline script with Node before browser testing.
- Run `node --check app.js` after editing JavaScript.
- Check that `index.html`, `app.js`, and `styles.css` paths still load from local file or deployment.
- Search for accidental placeholder or duplicate text if the user asked to remove copy.

## Automated Data-Safety Smoke

`npm run qa:browser` currently verifies that these edits survive a browser refresh in isolated local dev storage:

- Schedule day event.
- Periodization day notes.
- Session Planner block field.
- Medical Team recommendation comment.

This smoke test also verifies localhost dev-auth does not call `/api/client-config` and that the Data Safety export/import controls are present in the profile menu.

`npm run qa:api` also verifies that `/api/app-state-backup` rejects anonymous access and accepts a valid Vercel cron secret without exposing server secrets.

`qa/platform-safety-contracts.api.spec.mjs` is the long-term platform guardrail. It fails QA if protected storage keys, backup coverage, module contracts, live-smoke hooks, or the daily backup cron disappear during future refactors.

`npm run qa:contracts` runs the platform safety guardrail plus the inert modular core checks for registry coverage, permissions, events, and read-only storage adapters.

## Manual UI Checks

- Localhost opens the platform through dev-auth without hitting `/api/client-config`.
- Login opens the platform.
- First-login tutorial popup appears only when the user's preference allows it.
- Tutorial `Do not show again` stays respected for that user.
- Home news popup appears when the stored news version is older than `dashboardNewsVersion`.
- Football Science title opens Home.
- Top nav order is correct.
- Right account menu opens and Profile is reachable there.
- Profile image upload saves locally and appears in both Profile and the account menu.
- Home does not render the removed Today Command Center card.
- Home renders Staff Room high on the right, with Coach To-Do and Player/Team Alerts as the main work surface.
- Session Planner shows scheduled training days as planned even when exercise blocks are not added yet.
- Home lets a user add/delegate a task.
- Home task completion and removal update the visible lists.
- Home lets the current user add personal To-Do items.
- Profile lets the current user add personal To-Do items.
- Profile personal To-Do items surface on Home.
- Home staff chat can send and render messages.
- Home staff chat shows the sender profile image beside the name.
- Home staff chat shows sent and read receipt status on the current user's messages.
- Admin can delete a staff chat message and clear the staff chat with confirmation.
- Schedule Month and Overview modes work.
- Schedule Today goes to the real current day.
- Periodization Today opens the correct day and centered overlay.
- Periodization week cards remain aligned.
- Session Planner date strip scrolls smoothly.
- Session Planner arrows scroll the date strip only.
- Session Planner Today goes to today's training.
- Session Planner blocks can be selected without reloading the date strip.
- Long text does not break left cards.
- Exercise Library can save, use, archive, and restore an exercise without removing it from storage.
- Tacticalboard opens, can add objects, draw, select, delete, and close.
- New exercise Tacticalboard starts empty except pitch lines.
- Game Simulator route does not keep simulation running after leaving.

## Deployment Checks

Before telling the user the site is updated:

- Run `npm run qa:deploy` locally and require it to pass.
- Deploy with Vercel.
- Alias deployment to `footballscience.xyz`.
- Open or request a cache-busting URL.
- Confirm `/api/app-state-backup` returns `401` without authorization.
- Verify live assets and visible behavior.
- If live appears old, check localStorage/site data before assuming deployment failed.
