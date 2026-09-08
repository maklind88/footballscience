# Medical Room Design Coverage

Follow [AGENTS.md](../../AGENTS.md), including user-controlled release authorization and module ownership.

Status: verified local candidate, not released. Owner: Medical Room.
Branch: `codex/medical-complete-design-20260908`.
Baseline: `da14e839`.

## Scope

- Shared Medical typography, neutral surfaces, borders, controls and spacing across Availability, Review Queue, Active Cases, Rehab Programs, History, RTP Library and Reports.
- Player Availability, Medical Profile and Medical Plan dialogs, including expanded RTP builder/tracker content and the coach-safe renderer.
- RTP guide reader and its six sections, guide template dialog, Exercise Bank, player field board editor and Medical archive confirmations.
- Compact Lucide tool/close icons, persistent field labels, focus containment/return and reduced motion.
- Escape in a Medical archive confirmation cancels through the shared confirmation control without closing the underlying player draft.
- Medical-scoped styling only. Shared confirmation and tactical-board source files are unchanged.

## Protected Behavior

Recommendation colors remain exactly: 0% `#a63f35`, 10% `#f2b4b0`, 25% `#f0a24b`, 50% `#f6dc75`, 75% `#c2dda5`, 100% `#1f5b45`.
No recommendation/actual calculations, squad order, clinical data models, API writes, permissions or sync contracts changed.
KPI metrics remain in Reports, not Availability.

## Verification

- `quick:ui`: whitespace, changed-module syntax and path-risk checks.
- 10 design browser cases: all seven tabs at 1470/820/390/320 px, light/dark states, player dialogs, six guide sections, guide template, Exercise Bank, populated field board, focus loops, Escape, draft retention and archive cancellation. Screenshots use synthetic local fixtures.
- 8 existing Medical browser flows: recommendation persistence after refresh; protected record/plan archives; long-term plan drafts; planned-session metrics; match/rest-day context; squad order/quick controls; operations navigation; Available date-bound training guests/Presentation Mode.
- 20 focused renderer/bindings contracts: operations, player modal, plan form, recommendations, roster and runtime bindings.
- Final archive-dialog polish rerun: 2 desktop/mobile browser cases and the plan-form contract passed.

Tests live in `qa/medical-clinical-design.smoke.spec.mjs`, `qa/critical-flows.smoke.spec.mjs` and the corresponding Medical contract specs. Full platform QA and production verification are intentionally not part of this unreleased UI candidate.

## Limits / Follow-up

- Browser verification is Chromium at responsive viewport sizes, not a full Safari/iOS or assistive-technology certification.
- The coach-safe player surface shares dialog styling and has a renderer/privacy contract; its authenticated coach journey was not separately exercised in the design fixture.
- The existing custom-guide authoring surface remains a template, not a working persisted guide editor. The UI states this explicitly; no backend capability was invented.
- Field-board drawing retains its existing pointer-driven behavior; complete keyboard drawing is separate product work.
- Existing stylesheet debt remains. New library, tool and dialog styling is split into Medical-local files rather than extending global styles or changing another module.
- Release requires a new direct user Deploy/Live instruction in this chat.
