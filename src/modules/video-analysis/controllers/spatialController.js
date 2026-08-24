import { calibrationReadiness } from "../domain/pitchCalibration.model.js";
import { normalizeDynamicGraphic } from "../domain/dynamicGraphic.model.js";
import { pointerPercent } from "../services/presentationLayerGeometryService.js";
import { buildPitchCalibration, pitchLandmarks } from "../services/pitchCalibrationSolveService.js";
import { selectedPresentationItem, updatePresentationItem } from "../services/presentationService.js";
import { eventElement } from "../video-analysis.dom-events.js";

function localId(prefix = "spatial") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function spatialPatch(state = {}, patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      spatial: { ...(state.presentation?.spatial || {}), ...patch },
    },
  };
}

function mediaIdentity(state = {}) {
  return {
    matchId: state.match?.id || state.video?.match_id || state.source?.match_id || "",
    videoId: state.video?.id || state.source?.video_id || "",
    sourceId: state.source?.id || "",
  };
}

function selectedItem(state = {}) {
  return selectedPresentationItem(
    state.presentation?.current,
    state.presentation?.selectedItemId,
    state.presentation?.selectedClipId,
  );
}

function replaceItem(state = {}, itemId = "", patch = {}) {
  return {
    ...state,
    presentation: {
      ...(state.presentation || {}),
      current: updatePresentationItem(state.presentation?.current, itemId, patch),
    },
  };
}

function videoDurationMs(state = {}) {
  return Math.max(1, Math.round(Number(
    state.videoRef?.durationMs
      || state.video?.duration_ms
      || state.source?.duration_ms
      || state.timeline?.durationMs,
  ) || 1));
}

function currentPoints(spatial = {}) {
  if (Array.isArray(spatial.draftPoints) && spatial.draftPoints.length) return spatial.draftPoints;
  return spatial.calibration?.frames?.[0]?.controlPoints || [];
}

function nextLandmarkId(points = []) {
  const used = new Set(points.map((point) => point.landmarkId));
  return pitchLandmarks.find((landmark) => !used.has(landmark.id))?.id || pitchLandmarks[0].id;
}

function calibrationFromState(state = {}, points = currentPoints(state.presentation?.spatial)) {
  const spatial = state.presentation?.spatial || {};
  const existing = spatial.calibration || {};
  const identity = mediaIdentity(state);
  const calibration = buildPitchCalibration(points, {
    ...identity,
    id: existing.id,
    frameId: existing.frames?.[0]?.id,
    pitchLengthM: spatial.pitchLengthM || existing.pitchLengthM || 105,
    pitchWidthM: spatial.pitchWidthM || existing.pitchWidthM || 68,
    atMs: state.timeline?.playheadMs || 0,
    durationMs: videoDurationMs(state),
    validFromMs: 0,
    validToMs: videoDurationMs(state),
  });
  return {
    ...calibration,
    revision: existing.revision,
    expectedRevision: existing.revision,
    frames: calibration.frames.map((frame) => ({
      ...frame,
      revision: existing.frames?.[0]?.revision,
      expectedRevision: existing.frames?.[0]?.revision,
    })),
  };
}

export function createSpatialController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});

  async function openPanel(panel = "spatial") {
    if (panel !== "spatial") {
      updateState((state) => spatialPatch(state, { panel: "tracking", captureLandmarkId: "", error: "" }));
      return true;
    }
    const before = getState();
    const identity = mediaIdentity(before);
    updateState((state) => spatialPatch(state, { panel: "spatial", loading: Boolean(identity.videoId), error: "" }));
    if (!identity.videoId || !options.loadCalibration) return true;
    try {
      const payload = await options.loadCalibration(identity.videoId, identity.sourceId);
      const calibration = payload?.calibration || null;
      updateState((state) => spatialPatch(state, {
        loading: false,
        calibration,
        draftPoints: calibration?.frames?.[0]?.controlPoints || [],
        pitchLengthM: calibration?.pitchLengthM || state.presentation?.spatial?.pitchLengthM || 105,
        pitchWidthM: calibration?.pitchWidthM || state.presentation?.spatial?.pitchWidthM || 68,
        selectedLandmarkId: nextLandmarkId(calibration?.frames?.[0]?.controlPoints || []),
        loadedVideoId: identity.videoId,
        error: "",
      }));
    } catch (error) {
      updateState((state) => spatialPatch(state, { loading: false, error: error.message || "Calibration could not be loaded." }));
    }
    return true;
  }

  function updateField(field = "", value = "") {
    if (field === "landmark") {
      updateState((state) => spatialPatch(state, { selectedLandmarkId: value, error: "" }));
      return true;
    }
    const number = Number(value);
    updateState((state) => spatialPatch(state, {
      [field]: Number.isFinite(number) ? number : (field === "pitchLengthM" ? 105 : 68),
      error: "",
    }));
    return true;
  }

  function beginCapture(target = null) {
    const state = getState();
    const landmarkId = state.presentation?.spatial?.selectedLandmarkId || pitchLandmarks[0].id;
    target?.closest?.(".video-analysis-drawing-builder")
      ?.querySelector?.("[data-video-analysis-drawing-surface]")
      ?.scrollIntoView?.({ block: "nearest" });
    updateState((current) => spatialPatch(current, { captureLandmarkId: landmarkId, error: "" }));
    return true;
  }

  function startInteraction(event, surface) {
    const state = getState();
    const spatial = state.presentation?.spatial || {};
    const landmark = pitchLandmarks.find((entry) => entry.id === spatial.captureLandmarkId);
    if (spatial.panel !== "spatial" || !landmark) return false;
    const point = pointerPercent(event, surface);
    const pitchLengthM = Number(spatial.pitchLengthM || spatial.calibration?.pitchLengthM || 105);
    const pitchWidthM = Number(spatial.pitchWidthM || spatial.calibration?.pitchWidthM || 68);
    const controlPoint = {
      id: `control-${landmark.id}`,
      landmarkId: landmark.id,
      label: landmark.label,
      imageX: point.x / 100,
      imageY: point.y / 100,
      pitchXM: landmark.xM * (pitchLengthM / 105),
      pitchYM: landmark.yM * (pitchWidthM / 68),
    };
    const points = [...currentPoints(spatial).filter((entry) => entry.landmarkId !== landmark.id), controlPoint];
    const calibration = calibrationFromState(state, points);
    updateState((current) => spatialPatch(current, {
      draftPoints: points,
      calibration,
      selectedLandmarkId: nextLandmarkId(points),
      captureLandmarkId: "",
      error: "",
    }));
    event.preventDefault?.();
    return true;
  }

  function removePoint(pointId = "") {
    updateState((state) => {
      const points = currentPoints(state.presentation?.spatial).filter((point) => point.id !== pointId);
      return spatialPatch(state, {
        draftPoints: points,
        calibration: calibrationFromState(state, points),
        selectedLandmarkId: nextLandmarkId(points),
        error: "",
      });
    });
    return true;
  }

  function resetCalibration() {
    updateState((state) => spatialPatch(state, {
      calibration: null,
      draftPoints: [],
      selectedLandmarkId: pitchLandmarks[0].id,
      captureLandmarkId: "",
      error: "",
    }));
    return true;
  }

  function assignUnit(trackId = "", group = "a") {
    updateState((state) => {
      const spatial = state.presentation?.spatial || {};
      const ownKey = group === "b" ? "unitBIds" : "unitAIds";
      const otherKey = group === "b" ? "unitAIds" : "unitBIds";
      const own = new Set(spatial[ownKey] || []);
      const other = new Set(spatial[otherKey] || []);
      if (own.has(trackId)) own.delete(trackId);
      else { own.add(trackId); other.delete(trackId); }
      return spatialPatch(state, { [ownKey]: [...own], [otherKey]: [...other], error: "" });
    });
    return true;
  }

  async function addSpatialGraphic(type = "distance", group = "") {
    const state = getState();
    const item = selectedItem(state);
    const spatial = state.presentation?.spatial || {};
    const trackingIds = state.presentation?.tracking?.selectedTrackIds || [];
    const trackIds = type === "unit-hull"
      ? (group === "b" ? spatial.unitBIds : spatial.unitAIds) || []
      : trackingIds.slice(0, type === "distance" ? 2 : 1);
    const minimum = type === "unit-hull" ? 3 : type === "distance" ? 2 : 1;
    if (!item || trackIds.length < minimum) {
      updateState((current) => spatialPatch(current, { error: type === "unit-hull" ? "Assign at least three players to this unit." : "Select the required tracked players first." }));
      return false;
    }
    if (type !== "movement-curve" && !calibrationReadiness(spatial.calibration).ready) {
      updateState((current) => spatialPatch(current, { error: "Verify pitch calibration before adding metre layers." }));
      return false;
    }
    const clip = item.clip || {};
    const startMs = Math.max(0, Number(item.startMs ?? clip.startMs ?? clip.start_ms) || 0);
    const endMs = Math.max(startMs + 1, Number(item.endMs ?? clip.endMs ?? clip.end_ms) || startMs + 5000);
    let graphic = normalizeDynamicGraphic({
      id: localId(type),
      clipId: item.clipId,
      type,
      source: "spatial",
      startMs,
      endMs,
      trailDurationMs: Math.min(120_000, endMs - startMs),
      bindings: trackIds.map((trackId) => ({ trackId, role: group ? `unit-${group}` : "primary", anchor: "ground" })),
      style: { color: group === "b" ? "#42b4c4" : "#f7d154", showValue: true },
    });
    let warning = "";
    try {
      const payload = await options.persistGraphic?.(graphic);
      graphic = normalizeDynamicGraphic({ ...graphic, ...(payload?.dynamicGraphic || payload?.graphic || {}) });
    } catch {
      warning = "Layer added locally. Metadata sync is pending.";
    }
    updateState((current) => {
      const liveItem = selectedItem(current);
      if (!liveItem) return current;
      return spatialPatch(replaceItem(current, liveItem.id, {
        dynamicGraphics: [...(liveItem.dynamicGraphics || []), graphic],
      }), { error: warning });
    });
    return true;
  }

  async function saveCalibration(verify = false) {
    const state = getState();
    const calibration = calibrationFromState(state);
    if (!calibration.frames.length) {
      updateState((current) => spatialPatch(current, { error: "Place at least four pitch landmarks." }));
      return false;
    }
    if (verify && !calibrationReadiness(calibration).ready) {
      updateState((current) => spatialPatch(current, { error: "Improve calibration quality before verifying metres." }));
      return false;
    }
    const requested = { ...calibration, status: verify ? "verified" : calibration.status };
    updateState((current) => spatialPatch(current, { saving: true, error: "" }));
    try {
      const payload = await options.persistCalibration?.(requested);
      const saved = payload?.calibration || requested;
      updateState((current) => spatialPatch(current, {
        calibration: saved,
        draftPoints: saved.frames?.[0]?.controlPoints || currentPoints(current.presentation?.spatial),
        saving: false,
        error: "",
      }));
      return true;
    } catch (error) {
      updateState((current) => spatialPatch(current, { saving: false, error: error.message || "Calibration could not be saved." }));
      return false;
    }
  }

  function handleClick(event) {
    const target = eventElement(event);
    const panel = target?.closest?.("[data-video-analysis-spatial-panel]")?.dataset?.videoAnalysisSpatialPanel;
    if (panel) { void openPanel(panel); return true; }
    const actionNode = target?.closest?.("[data-video-analysis-spatial-action]");
    const action = actionNode?.dataset?.videoAnalysisSpatialAction;
    if (action === "place") return beginCapture(target);
    if (action === "remove-point") return removePoint(actionNode.dataset.videoAnalysisSpatialPoint);
    if (action === "assign-unit") return assignUnit(actionNode.dataset.videoAnalysisSpatialTrack, actionNode.dataset.videoAnalysisSpatialGroup);
    if (action === "reset") return resetCalibration();
    if (action === "save") { void saveCalibration(false); return true; }
    if (action === "verify") { void saveCalibration(true); return true; }
    if (action === "add-distance") { void addSpatialGraphic("distance"); return true; }
    if (action === "add-path") { void addSpatialGraphic("movement-curve"); return true; }
    if (action === "add-unit") { void addSpatialGraphic("unit-hull", actionNode.dataset.videoAnalysisSpatialGroup); return true; }
    return false;
  }

  function handleChange(event) {
    const field = eventElement(event)?.closest?.("[data-video-analysis-spatial-field]");
    return field ? updateField(field.dataset.videoAnalysisSpatialField, field.value) : false;
  }

  return { handleChange, handleClick, openPanel, startInteraction };
}
