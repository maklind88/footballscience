import { normalizeTimelineWorkspace } from "../domain/timelineWorkspace.model.js";
import { timelineSelectedClipIds } from "../services/clipEditingService.js";
import {
  addAnalysisTimeline,
  addTimelineRow,
  duplicateTimelineRows,
  moveTimelineRowByStep,
  placeClipsInTimelineRow,
  removeTimelineRows,
  updateTimelineRows,
} from "../services/timelineWorkspaceService.js";

let localId = 0;

function nextId(prefix = "item") {
  localId += 1;
  return `${prefix}-${Date.now().toString(36)}-${localId.toString(36)}`;
}

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

function activeTimeline(workspace = {}) {
  return workspace.timelines.find((timeline) => timeline.id === workspace.activeTimelineId)
    || workspace.timelines[0]
    || null;
}

function replaceActiveTimeline(workspace = {}, timeline = null) {
  if (!timeline) return workspace;
  return {
    ...workspace,
    timelines: workspace.timelines.map((entry) => entry.id === timeline.id ? timeline : entry),
  };
}

function historySnapshot(workspace = {}, label = "Change timeline") {
  return {
    label,
    recordedAt: new Date().toISOString(),
    value: {
      timelines: workspace.timelines,
      activeTimelineId: workspace.activeTimelineId,
      selectedRowIds: workspace.selectedRowIds,
    },
  };
}

export function createTimelineWorkspaceController(dependencies = {}) {
  const getState = dependencies.getState || (() => ({}));
  const updateState = dependencies.updateState || (() => {});
  const saveTimeline = dependencies.saveTimeline || (async (timeline) => ({ timeline }));
  const startCollaboration = dependencies.startCollaboration || (async () => null);
  const stopCollaboration = dependencies.stopCollaboration || (async () => {});

  function setWorkspace(updater, options = {}) {
    updateState((state) => {
      const current = normalizeTimelineWorkspace(state.timelineWorkspace);
      const next = normalizeTimelineWorkspace(updater(current, state) || current);
      const history = options.record === false
        ? current.history
        : [...current.history, historySnapshot(current, options.label)].slice(-20);
      const dirtyTimelineIds = options.dirty === false
        ? next.dirtyTimelineIds
        : [...new Set([...next.dirtyTimelineIds, next.activeTimelineId].filter(Boolean))];
      return {
        ...state,
        timelineWorkspace: { ...next, history, dirtyTimelineIds, error: "" },
      };
    });
  }

  function updateActive(updater, options = {}) {
    setWorkspace((workspace) => replaceActiveTimeline(
      workspace,
      updater(activeTimeline(workspace), workspace),
    ), options);
  }

  async function saveActiveTimeline() {
    const state = getState();
    const workspace = normalizeTimelineWorkspace(state.timelineWorkspace);
    const timeline = activeTimeline(workspace);
    if (!timeline) return null;
    const matchId = timeline.matchId || state.match?.id || state.videoRef?.matchId || "";
    if (!matchId) {
      updateState((current) => ({
        ...current,
        timelineWorkspace: {
          ...normalizeTimelineWorkspace(current.timelineWorkspace),
          saveStatus: "error",
          error: "Connect the timeline to a match before saving.",
        },
      }));
      return null;
    }
    updateState((current) => ({
      ...current,
      timelineWorkspace: {
        ...normalizeTimelineWorkspace(current.timelineWorkspace),
        saveStatus: "saving",
        error: "",
      },
    }));
    try {
      const result = await saveTimeline({ ...timeline, matchId });
      const saved = result?.timeline || timeline;
      updateState((current) => {
        const latest = normalizeTimelineWorkspace(current.timelineWorkspace);
        const savedId = String(saved.id || timeline.id);
        return {
          ...current,
          message: "Timeline saved",
          timelineWorkspace: normalizeTimelineWorkspace({
            ...latest,
            timelines: latest.timelines.map((entry) => entry.id === timeline.id ? saved : entry),
            activeTimelineId: savedId,
            loadedMatchId: matchId,
            saveStatus: "ready",
            error: "",
            dirtyTimelineIds: latest.dirtyTimelineIds.filter((id) => id !== timeline.id && id !== savedId),
          }),
        };
      });
      return saved;
    } catch (error) {
      updateState((current) => ({
        ...current,
        timelineWorkspace: {
          ...normalizeTimelineWorkspace(current.timelineWorkspace),
          saveStatus: error?.status === 409 ? "conflict" : "error",
          error: error?.status === 409
            ? "This timeline changed in another session. Reload it before saving again."
            : error?.message || "Timeline could not be saved.",
        },
      }));
      return null;
    }
  }

  async function toggleCollaboration() {
    const state = getState();
    const workspace = normalizeTimelineWorkspace(state.timelineWorkspace);
    let active = activeTimeline(workspace);
    if (["connecting", "connected"].includes(workspace.collaboration.status)) {
      await stopCollaboration();
      return null;
    }
    if (!active) return null;
    if (!isUuid(active.id) || workspace.dirtyTimelineIds.includes(active.id)) {
      active = await saveActiveTimeline();
      if (!active) return null;
    }
    updateState((current) => ({
      ...current,
      timelineWorkspace: {
        ...normalizeTimelineWorkspace(current.timelineWorkspace),
        collaboration: {
          ...normalizeTimelineWorkspace(current.timelineWorkspace).collaboration,
          status: "connecting",
          error: "",
        },
      },
    }));
    try {
      const session = await startCollaboration(active);
      return session;
    } catch (error) {
      updateState((current) => ({
        ...current,
        timelineWorkspace: {
          ...normalizeTimelineWorkspace(current.timelineWorkspace),
          collaboration: {
            ...normalizeTimelineWorkspace(current.timelineWorkspace).collaboration,
            status: "error",
            error: error?.message || "Live collaboration could not start.",
          },
        },
      }));
      return null;
    }
  }

  function handleClick(event) {
    const target = event?.target?.closest ? event.target : event?.target?.parentElement;
    if (!target?.closest) return false;
    const timelineTab = target.closest("[data-video-analysis-workspace-timeline]");
    if (timelineTab) {
      setWorkspace((workspace) => ({
        ...workspace,
        activeTimelineId: timelineTab.dataset.videoAnalysisWorkspaceTimeline,
        selectedRowIds: [],
      }), { record: false, dirty: false });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-timeline-add]")) {
      const state = getState();
      setWorkspace((workspace) => addAnalysisTimeline(workspace, {
        id: nextId("timeline"),
        title: `Timeline ${workspace.timelines.length + 1}`,
        matchId: state.match?.id || state.videoRef?.matchId || "",
        rows: [{ id: nextId("row"), label: "New row", kind: "manual" }],
      }), { label: "Add timeline" });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-editor-open]")) {
      setWorkspace((workspace) => ({ ...workspace, editorOpen: true }), { record: false, dirty: false });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-editor-close]")) {
      setWorkspace((workspace) => ({ ...workspace, editorOpen: false }), { record: false, dirty: false });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-save]")) {
      void saveActiveTimeline();
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-collaboration]")) {
      void toggleCollaboration();
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-row-add]")) {
      updateActive((timeline) => addTimelineRow(timeline, {
        id: nextId("row"),
        label: `Row ${(timeline?.rows?.length || 0) + 1}`,
        kind: "manual",
      }), { label: "Add row" });
      return true;
    }
    const rowMove = target.closest("[data-video-analysis-workspace-row-move]");
    if (rowMove) {
      const [rowId, direction] = String(rowMove.dataset.videoAnalysisWorkspaceRowMove || "").split(":");
      updateActive((timeline) => moveTimelineRowByStep(timeline, rowId, Number(direction)), { label: "Move row" });
      return true;
    }
    const clipPlacement = target.closest("[data-video-analysis-workspace-clips-place]");
    if (clipPlacement) {
      const [rowId, mode] = String(clipPlacement.dataset.videoAnalysisWorkspaceClipsPlace || "").split(":");
      const state = getState();
      const selectedClipIds = timelineSelectedClipIds(state);
      updateActive((timeline) => placeClipsInTimelineRow(timeline, selectedClipIds, rowId, {
        duplicate: mode === "duplicate",
      }), { label: mode === "duplicate" ? "Duplicate clips to row" : "Move clips to row" });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-rows-duplicate]")) {
      updateActive((timeline, workspace) => duplicateTimelineRows(timeline, workspace.selectedRowIds), { label: "Duplicate rows" });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-rows-hide]")) {
      updateActive((timeline, workspace) => {
        const selected = timeline.rows.filter((row) => workspace.selectedRowIds.includes(row.id));
        const hidden = selected.length > 0 && !selected.every((row) => row.hidden);
        return updateTimelineRows(timeline, workspace.selectedRowIds, { hidden });
      }, { label: "Show or hide rows" });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-rows-remove]")) {
      updateActive((timeline, workspace) => removeTimelineRows(timeline, workspace.selectedRowIds), { label: "Archive rows" });
      setWorkspace((workspace) => ({ ...workspace, selectedRowIds: [] }), { record: false, dirty: false });
      return true;
    }
    if (target.closest("[data-video-analysis-workspace-undo]")) {
      updateState((state) => {
        const workspace = normalizeTimelineWorkspace(state.timelineWorkspace);
        const entry = workspace.history.at(-1);
        if (!entry?.value) return state;
        return {
          ...state,
          timelineWorkspace: normalizeTimelineWorkspace({
            ...workspace,
            ...entry.value,
            editorOpen: workspace.editorOpen,
            history: workspace.history.slice(0, -1),
            dirtyTimelineIds: [...new Set([
              ...workspace.dirtyTimelineIds,
              entry.value.activeTimelineId || workspace.activeTimelineId,
            ].filter(Boolean))],
          }),
        };
      });
      return true;
    }
    return false;
  }

  function handleInput(event) {
    const target = event?.target;
    if (!target?.matches) return false;
    if (target.matches("[data-video-analysis-workspace-timeline-title]")) {
      updateActive((timeline) => ({ ...timeline, title: String(target.value || "").slice(0, 180) }), { record: false, dirty: true });
      return true;
    }
    const rowLabel = target.dataset.videoAnalysisWorkspaceRowLabel;
    if (rowLabel) {
      updateActive((timeline) => updateTimelineRows(timeline, [rowLabel], {
        label: String(target.value || "").slice(0, 120),
      }), { record: false, dirty: true });
      return true;
    }
    return false;
  }

  function handleChange(event) {
    const target = event?.target;
    if (!target?.matches) return false;
    const rowSelect = target.dataset.videoAnalysisWorkspaceRowSelect;
    if (rowSelect) {
      setWorkspace((workspace) => {
        const selected = new Set(workspace.selectedRowIds);
        if (target.checked) selected.add(rowSelect);
        else selected.delete(rowSelect);
        return { ...workspace, selectedRowIds: [...selected] };
      }, { record: false, dirty: false });
      return true;
    }
    const rowColor = target.dataset.videoAnalysisWorkspaceRowColor;
    if (rowColor) {
      updateActive((timeline) => updateTimelineRows(timeline, [rowColor], { color: target.value }), { label: "Change row color" });
      return true;
    }
    const rowHidden = target.dataset.videoAnalysisWorkspaceRowHidden;
    if (rowHidden) {
      updateActive((timeline) => updateTimelineRows(timeline, [rowHidden], { hidden: target.checked }), { label: "Show or hide row" });
      return true;
    }
    const rowLocked = target.dataset.videoAnalysisWorkspaceRowLocked;
    if (rowLocked) {
      updateActive((timeline) => ({
        ...timeline,
        rows: timeline.rows.map((row) => row.id === rowLocked ? { ...row, locked: target.checked } : row),
      }), { label: "Lock or unlock row" });
      return true;
    }
    return false;
  }

  return { handleClick, handleInput, handleChange, saveActiveTimeline, toggleCollaboration };
}
