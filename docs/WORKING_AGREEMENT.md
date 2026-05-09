# Working Agreement

## How We Work

- Build one thing properly before moving to the next.
- Keep the platform flexible and modular.
- Avoid clutter and unnecessary copy.
- Do not invent real coaching content unless explicitly asked. Use structure and sample placeholders only where useful.
- Verify changes before saying they are done.
- When a finished change should be visible on the public website, deploy it to Vercel, alias it to `footballscience.xyz`, and verify the live files before saying it is done.
- In every Codex chat, follow the stable release order in `AGENTS.md`: validate, commit intended files only, push after QA, deploy only after the release gate, then run postdeploy verification.
- If work becomes slow because context is huge, start a new thread and read `docs/AI_HANDOFF.md`.

## What Good Looks Like

- The UI is clean enough that coaches understand it without explanation.
- Admin tools are powerful but not visually noisy.
- Every module can grow without turning the code into chaos.
- The user can test locally and see the same thing that was claimed.
- Future Codex sessions can continue from docs, not memory.

## When To Update Docs

Update these docs when:

- Navigation changes.
- A module changes behavior.
- Storage keys change.
- Deployment process changes.
- A new major decision is made.
- The user gives a durable preference.
