import { createSessionPlannerTacticalPlaybackController } from "./session-planner-tactical-playback-controller.mjs";
import { getReadonlyTacticalView } from "./session-planner-readonly-playback-renderer.mjs";

// Only visual input crosses this boundary. There is deliberately no save callback.
export function createReadonlyTacticalPlaybackController({ win, getWorkspace, renderVisual, workspaceId = "" }) {
  let view = null;
  let signature = "";
  let player = null;
  function ensurePlayer() {
    player ||= createSessionPlannerTacticalPlaybackController({
      win, getWorkspace, renderVisual, workspaceId, readOnly: true,
      getEditorBlock: () => view,
    });
    return player;
  }
  function retain(block, contextKey) {
    const next = getReadonlyTacticalView(block);
    const nextSignature = next ? JSON.stringify([contextKey, next]) : "";
    if (nextSignature !== signature) {
      player?.stop();
      signature = nextSignature;
      view = next ? structuredClone(next) : null;
      return null;
    }
    return player?.retainOverlay() || null;
  }
  return {
    retain,
    mount() { if (view) ensurePlayer().mount(); else player?.mount(); },
    stop() { player?.stop(); },
    reset() { player?.destroy(); player = null; view = null; signature = ""; },
  };
}
