# Decision Log

## Current Product Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-05-03 | Keep a local static prototype while product shape evolves. | Fast iteration is more valuable right now than backend complexity. |
| 2026-05-03 | Use docs as project memory and handoff. | Chat context is too large and slows down work. |
| 2026-05-03 | Main navigation is top icon navigation only. | Cleaner Apple-like platform layout and no left sidebar clutter. |
| 2026-05-03 | Profile is handled from the right account menu, not main nav. | Avoid duplicate profile entry points. |
| 2026-05-03 | Session Planner sessions belong to one date only. | Prevents the same training from appearing across every day. |
| 2026-05-03 | Bump Session Planner storage to `football-session-planner-v3`. | Avoid old localStorage data making live site look outdated. |
| 2026-05-03 | Periodization empty fields should render blank. | Reduces visual noise in week view. |
| 2026-05-03 | Game Simulator should open through tutorial then fullscreen. | The old embedded view is too cluttered. |
| 2026-05-03 | Tacticalboard belongs inside Session Planner for exercise visuals. | Coaches need one flow to create session content and diagrams. |

## Principles

- Prefer small, verified changes over giant fragile rewrites.
- Preserve existing working modules unless the user asks for a rebuild.
- If a UI section has no real content yet, use a polished placeholder instead of fake data.
- If a change affects persisted localStorage data, consider versioning the storage key.
