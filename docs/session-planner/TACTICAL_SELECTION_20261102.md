# Tacticalboard selection precision — 2026-11-02

## Cause and scope

Session Planner's selection and movement helpers treated absent endpoint coordinates
as real zero coordinates (`Number(null) === 0`). Normalized player/equipment markers
therefore acquired selection points at the pitch origin and at a midpoint toward it.
Clipboard and drag operations could also materialize those missing coordinates as
numeric offsets. This explains selection of distant objects without shared IDs.
The selection helper served by Live matched the inspected main revision `ce535493a`.

The fix is limited to Session Planner's coordinate, selection and transform helpers.
Marker selection and arrange bounds use the marker's actual x/y; irrelevant endpoint
fields in older saved markers are ignored without a migration or repair write.
Copy/move no longer creates absent endpoints or curve controls. Actual zero-valued
coordinates in line/curve/freehand geometry remain valid. Existing selection rules
for drawn lines/shapes are otherwise preserved.

No auth, API, central sync, storage schema or other module is changed. Production
content was not edited. A new direct Deploy/Live instruction is required to release
this candidate; the prior reset-animation release is a completed separate task.

## Verification

- 15 new regression cases failed before the fix, then passed unchanged.
- 32 selection, clipboard, interaction and controller contract tests passed.
- 11 browser tests passed: new marquee/group/copy/undo/reload scenarios at 1470px
  and 1170px plus existing drawing tools across five pitch modes and mobile layout.
- `npm run check` and `git diff --check` passed.

Tests use isolated synthetic exercises, including previously saved marker objects
with numeric stray endpoints. They verify unrelated objects and animation frames
remain unchanged, and that new selection replaces the earlier selection.
