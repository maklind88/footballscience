import { createSessionPlannerTacticalHelpers } from "../../src/modules/session-planner/session-planner-tactical-helpers.mjs";

const helpers = createSessionPlannerTacticalHelpers();

export function denseTacticalBlock(count = 12) {
  const types = ["blue-player", "red-player", "neutral-player", "ball", "cone", "mini-goal", "pole", "arrow"];
  const frames = Array.from({ length: count }, (_, frameIndex) => helpers.cloneTacticalFrame({
    id: `dense-frame-${frameIndex}`, label: `Frame ${frameIndex + 1}`,
    elements: Array.from({ length: 64 }, (_, index) => ({
      id: `tactical-1757538000000-marker-${index}`,
      type: types[index % types.length],
      x: 8.123456789012345 + index % 8 * 11 + frameIndex / 10,
      y: 9.987654321098765 + Math.floor(index / 8) * 10,
      ...(index % 8 === 7 ? { x2: 95, y2: 85 } : {}),
    })),
  }));
  return { id: "qa-dense", label: "Block 1", title: "Dense sequence", minutes: 15,
    tacticalPitchMode: "full-wide", tacticalFrames: frames, tacticalActiveFrameId: frames.at(-1).id,
    tacticalElements: structuredClone(frames.at(-1).elements), diagram: "empty", organization: "Keep all players and equipment." };
}
