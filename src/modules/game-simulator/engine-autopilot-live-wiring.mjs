import { createGameSimulatorAutopilotLiveEngine } from "./autopilot-live-engine.mjs";

export function createGameSimulatorAutopilotLiveRuntime(context = {}) {
  return createGameSimulatorAutopilotLiveEngine(context);
}
