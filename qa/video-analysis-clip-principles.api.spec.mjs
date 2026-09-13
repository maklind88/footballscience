import { test, expect } from "@playwright/test";
import { renderClipEditor } from "../src/modules/video-analysis/timeline/timeline.clip-editor.renderer.js";
import { getAllTimelineLaneValues } from "../src/modules/video-analysis/timeline/timeline.selectors.js";
import { normalizeTimelineLaneMode } from "../src/modules/video-analysis/timeline/timeline.service.js";
import { clipMiniGamePrincipleIds } from "../src/modules/video-analysis/services/miniGamePrincipleService.js";

test("principles are linked metadata, not duplicate timeline rows", () => {
  const clip = { id: "a", phase: "Out of Possession", subPhase: "High Press", metadata: { clipKind: "subPhase" },
    miniGamePrincipleId: "trigger", labels: [{ type: "mini_game_principle", value: "ballside" }] };
  const original = structuredClone(clip);
  expect(getAllTimelineLaneValues(clip)).toEqual(["Sub-phase / High Press"]);
  expect(clipMiniGamePrincipleIds(clip)).toEqual(["trigger", "ballside"]);
  expect(getAllTimelineLaneValues({ ...clip, metadata: { clipKind: "player" }, players: [{ player_label: "Uno" }] })).toEqual(["Player / Uno"]);
  expect(clip).toEqual(original);
});

test("historical standalone principles stay reachable without modifying saved clips", () => {
  const legacy = { id: "legacy", miniGamePrincipleId: "trigger", metadata: { clipKind: "miniGamePrinciple" } };
  expect(getAllTimelineLaneValues({ ...legacy, subPhase: "High Press" })).toEqual(["Sub-phase / High Press"]);
  expect(getAllTimelineLaneValues({ ...legacy, phase: "Out of Possession" })).toEqual(["Phase / Out of Possession"]);
  expect(getAllTimelineLaneValues(legacy)).toEqual(["Unclassified clips"]);
  expect(getAllTimelineLaneValues({ id: "old", mini_game_principle_id: "trigger" })).toEqual(["Unclassified clips"]);
  expect(normalizeTimelineLaneMode("miniGamePrinciple")).toBe("all");
  expect(legacy).not.toHaveProperty("subPhase");
});

test("MG tool is immediately before Edit with a separate searchable dialog", () => {
  const html = renderClipEditor({ id: "a", subPhase: "High Press" }, { canEdit: true });
  expect(html.indexOf("data-clip-principles-open")).toBeLessThan(html.indexOf("data-clip-edit-open"));
  expect(html).toContain('aria-controls="video-analysis-clip-principles-dialog"');
  expect(html).toContain('aria-label="Search MG Principles"');
  expect(html).not.toContain("<details");
  expect(html).toContain('value="trigger"');
  expect(html).toContain('value="third-player"');
});
