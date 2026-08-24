import { normalizeTimelineWorkspace } from "./domain/timelineWorkspace.model.js";
import { createCollaborationPollingService } from "./services/collaborationPollingService.js";

function actorForContext(context = {}) {
  const user = context.currentUser || {};
  return {
    id: String(user.id || user.userId || user.user_id || ""),
    name: String(context.formatUserName?.(user) || user.name || user.displayName || "Analyst"),
  };
}

export function createVideoAnalysisCollaborationRuntime(options = {}) {
  const context = options.context || {};
  const getRuntime = options.getRuntime || (() => null);
  const repository = options.repository || {};
  const timerHost = context.win || globalThis;
  let remoteRefreshTimer = 0;

  function updateCollaboration(patch = {}) {
    const runtime = getRuntime();
    if (!runtime) return;
    runtime.store.update((state) => {
      const workspace = normalizeTimelineWorkspace(state.timelineWorkspace);
      return {
        ...state,
        timelineWorkspace: {
          ...workspace,
          collaboration: { ...workspace.collaboration, ...patch },
        },
      };
    });
  }

  function queueRemoteAnalysisRefresh(operation = {}) {
    const runtime = getRuntime();
    if (!runtime) return;
    const workspace = normalizeTimelineWorkspace(runtime.store.getState().timelineWorkspace);
    if (operation.entityType === "timeline" && workspace.dirtyTimelineIds.length) {
      updateCollaboration({
        pendingRemoteChanges: workspace.collaboration.pendingRemoteChanges + 1,
      });
      return;
    }
    if (remoteRefreshTimer) timerHost.clearTimeout?.(remoteRefreshTimer);
    remoteRefreshTimer = timerHost.setTimeout?.(async () => {
      remoteRefreshTimer = 0;
      if (operation.entityType === "timeline") {
        await options.loadTimelineWorkspace?.({ force: true });
      } else {
        await options.loadClips?.();
      }
    }, 250) || 0;
  }

  const service = createCollaborationPollingService({
    repository,
    getActor: () => actorForContext(getRuntime()?.context || context),
    onOperation: queueRemoteAnalysisRefresh,
    onPresence: (participants) => updateCollaboration({ participants }),
    onStatus: (status, error = null) => updateCollaboration({
      status,
      error: error?.message || "",
    }),
    timerHost,
  });

  async function start(timeline = {}) {
    const runtime = getRuntime();
    if (!runtime) throw new Error("FS Player is not ready.");
    const state = runtime.store.getState();
    const payload = await repository.startCollaborationSession({
      matchId: timeline.matchId || state.match?.id || state.videoRef?.matchId || "",
      timelineId: timeline.id,
      title: `${timeline.title || "Match timeline"} live`,
    });
    const session = payload.collaborationSession;
    if (!session?.id) throw new Error("Live collaboration session could not be created.");
    updateCollaboration({ sessionId: session.id, status: "connecting", error: "" });
    await service.join(session);
    return session;
  }

  async function dispose() {
    if (remoteRefreshTimer) timerHost.clearTimeout?.(remoteRefreshTimer);
    remoteRefreshTimer = 0;
    await service.disconnect();
  }

  return {
    dispose,
    service,
    start,
    stop: () => service.disconnect(),
    operationContext: () => ({
      collaborationSessionId: service.getSession()?.id || "",
      clientId: service.getClientId(),
    }),
  };
}
