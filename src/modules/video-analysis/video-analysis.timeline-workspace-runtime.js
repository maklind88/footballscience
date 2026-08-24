import { createDefaultTimelineWorkspace, normalizeTimelineWorkspace } from "./domain/timelineWorkspace.model.js";
import { createTimelineWorkspaceRepository } from "./repositories/timelineWorkspaceRepository.js";
import { createTimelineWorkspaceController } from "./timeline/timeline.workspace.controller.js";

export function createVideoAnalysisTimelineWorkspaceRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const getCollaborationRuntime = options.getCollaborationRuntime || (() => null);
  const repository = createTimelineWorkspaceRepository(context);

  async function load(loadOptions = {}) {
    const runtime = getRuntime();
    if (!runtime) return null;
    const state = runtime.store.getState();
    const matchId = String(loadOptions.matchId || state.match?.id || state.videoRef?.matchId || "").trim();
    const workspace = normalizeTimelineWorkspace(state.timelineWorkspace);
    if (!options.shouldLoadMetadata?.(runtime.context, state) || !matchId) return workspace;
    if (!loadOptions.force && workspace.loadedMatchId === matchId && ["loading", "ready"].includes(workspace.loadStatus)) {
      return workspace;
    }
    runtime.store.update((current) => ({
      ...current,
      timelineWorkspace: {
        ...normalizeTimelineWorkspace(current.timelineWorkspace),
        loadedMatchId: matchId,
        loadStatus: "loading",
        error: "",
      },
    }));
    try {
      const payload = await repository.list(matchId, 40);
      const timelines = Array.isArray(payload.timelines) && payload.timelines.length
        ? payload.timelines
        : createDefaultTimelineWorkspace(matchId).timelines;
      let loadedWorkspace = null;
      runtime.store.update((current) => {
        const latest = normalizeTimelineWorkspace(current.timelineWorkspace);
        const requestedActiveId = timelines.some((timeline) => timeline.id === latest.activeTimelineId)
          ? latest.activeTimelineId
          : timelines[0]?.id || "";
        loadedWorkspace = normalizeTimelineWorkspace({
          ...latest,
          timelines,
          activeTimelineId: requestedActiveId,
          selectedRowIds: [],
          history: [],
          dirtyTimelineIds: [],
          loadedMatchId: matchId,
          loadStatus: "ready",
          saveStatus: "idle",
          error: "",
        });
        return { ...current, timelineWorkspace: loadedWorkspace };
      });
      return loadedWorkspace;
    } catch (error) {
      runtime.store.update((current) => ({
        ...current,
        timelineWorkspace: {
          ...normalizeTimelineWorkspace(current.timelineWorkspace),
          loadedMatchId: matchId,
          loadStatus: "error",
          error: error?.message || "Timelines could not be loaded.",
        },
      }));
      return null;
    }
  }

  const controller = createTimelineWorkspaceController({
    getState: () => getRuntime()?.store.getState() || {},
    updateState: (updater) => getRuntime()?.store.update(updater),
    saveTimeline: (timeline) => repository.save({
      ...timeline,
      ...getCollaborationRuntime()?.operationContext(),
    }),
    startCollaboration: (timeline) => getCollaborationRuntime()?.start(timeline),
    stopCollaboration: () => getCollaborationRuntime()?.stop(),
  });

  return { controller, load, repository };
}
