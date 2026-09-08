# Responsive Baseline Audit

Date: 2026-09-08

Base commit: `af7ec2475125d70741d79fbc9c6e492f821d7690`

Mode: read-only product audit; no responsive product styles or behavior changed

## Scope

The audit exercised 15 platform workspaces at five representative viewport sizes:

| Profile | Viewport |
| --- | --- |
| Desktop | 1440 x 900 |
| Compact desktop | 1280 x 800 |
| iPad landscape | 1024 x 768 |
| iPad portrait | 834 x 1194 |
| Mobile reference | 390 x 844 |

The primary product targets are desktop and iPad. The mobile reference remains important for graceful access, even when a dense coaching workflow is intentionally better on a larger screen.

## Baseline Result

- 75 workspace/viewport combinations completed.
- All 75 opened the requested workspace successfully.
- No page-level horizontal document overflow was detected.
- 24 combinations contained an element outside the viewport. Several are intentional internal horizontal scrollers and require visual classification before changes.
- 48 combinations produced at least one text-clipping candidate. Many are deliberate ellipsis treatments; Schedule and Session Planner contain visually confirmed cases that need redesign.
- 45 touch-viewport combinations produced controls below a 44 x 44 pixel target. Calendar cells account for many signals, so counts are diagnostic rather than a release gate.

## Confirmed Findings

### Must Fix Before Calling The Platform Fully Adaptive

1. **Schedule on narrow screens**
   - At 390 px, two month panels are compressed into the available width.
   - Event labels become heavily truncated and the calendar is difficult to scan or operate.
   - Recommended behavior: one month per row on narrow screens, with a deliberate internal month switch instead of shrinking two calendars.

2. **Session Planner on mobile reference width**
   - The date strip, Today control, header actions, and some Medical recommendation controls clip or compete for the same horizontal space.
   - Recommended behavior: keep the session canvas primary, move secondary actions into a compact action menu, and let the date rail scroll independently with visible edge affordance.

3. **Touch target consistency**
   - Home calendar arrows/days and several Medical quick controls are below the preferred iPad touch target.
   - Recommended behavior: use a shared minimum interactive size token, with documented exceptions only for dense grids.

### Should Fix Soon

1. Schedule is dense in iPad portrait because two months remain side by side.
2. Some workspace headings use ellipsis even when a second line would be clearer.
3. Dense modules use different breakpoint values and different strategies for the same toolbar/card patterns.
4. Desktop Home uses the available width safely but leaves a large amount of low-value empty space at wide sizes.

## Architecture Findings

- The repository currently has 98 CSS files and about 70,554 CSS lines.
- There are 312 media/container query declarations.
- Breakpoints are fragmented across values such as 560, 680, 760, 820, 900, 980, and 1180 px, including duplicate formatting variants.
- The largest style owners are Scouting, Video Analysis, Medical, IDP, and Presentation Mode.
- Existing responsive browser coverage is specialized by module. The default Playwright project is desktop-only; there is no shared cross-workspace desktop/iPad baseline gate.

This does not mean the platform needs a rewrite. It means future work should converge on shared adaptive contracts instead of adding more isolated media queries.

## Recommended Delivery Order

1. Add a non-mutating responsive contract test for desktop, compact desktop, iPad landscape, and iPad portrait.
2. Define shared Apple-oriented layout tokens: content gutters, compact toolbar behavior, minimum touch target, sidebar states, and text wrapping rules.
3. Fix Schedule and Session Planner first because they have visually confirmed functional compression.
4. Apply the same toolbar, action-menu, table-scroll, and touch-target contracts module by module.
5. Run screenshot comparison and keyboard/touch checks after each module; release each module independently.

## Guardrails

- Preserve the existing light appearance as the visual reference.
- Keep the Apple-oriented product language: restrained surfaces, clear hierarchy, high legibility, subtle depth, and purposeful motion.
- Do not solve narrow screens by scaling the whole interface or shrinking text globally.
- Do not hide required actions without a discoverable menu.
- Do not remove intentional internal scrolling from dense tables, timelines, boards, or date rails.
- Do not combine the responsive program with auth, central sync, Supabase, or data-model changes.

## Acceptance Target

The responsive program is complete when every owned module passes the shared desktop/iPad viewport matrix, has no page-level horizontal overflow, keeps primary actions visible and operable, preserves readable text hierarchy, and uses documented touch-target exceptions only where density genuinely requires them.
