import { normalizeDrawingGeometry } from "./presentationLayerGeometryService.js";

export const presentationModes = Object.freeze([
  { id: "overview", label: "Library" },
  { id: "builder", label: "Build" },
  { id: "draw", label: "Telestrate" },
  { id: "presenter", label: "Present" },
]);

export const presentationDrawingTools = Object.freeze([
  { id: "freehand", label: "Freehand" },
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Circle" },
  { id: "spotlight", label: "Spotlight" },
  { id: "text", label: "Text" },
  { id: "freeze", label: "Freeze" },
  { id: "zoom", label: "Zoom" },
]);

const defaultSections = Object.freeze([
  { id: "opening", title: "Opening", sectionType: "opening", coachNote: "", items: [] },
  { id: "team-focus", title: "Team focus", sectionType: "team", coachNote: "", items: [] },
  { id: "player-focus", title: "Player focus", sectionType: "player", coachNote: "", items: [] },
]);

function localId(prefix = "local") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function stringValue(value = "") {
  return String(value || "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function booleanValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function normalizePresentationMode(mode = "") {
  return presentationModes.some((item) => item.id === mode) ? mode : "overview";
}

export function normalizePresentationDrawingTool(tool = "") {
  return presentationDrawingTools.some((item) => item.id === tool) ? tool : "arrow";
}

export function createDefaultPresentation() {
  return {
    id: "",
    title: "Football Science Review",
    purpose: "team-meeting",
    status: "draft",
    notes: "",
    sections: defaultSections.map((section, index) => ({ ...section, sortOrder: index, items: [] })),
    shareTargets: [],
  };
}

export function createInitialPresentationWorkspace() {
  return {
    status: "idle",
    presentations: [],
    smartCollections: [],
    activePresentationId: "",
    activeSectionId: "opening",
    selectedItemId: "",
    selectedClipId: "",
    mode: "overview",
    librarySearch: "",
    drawingTool: "arrow",
    drawingUndoStack: [],
    drawingRedoStack: [],
    drawingInteraction: null,
    selectedDrawingLayerId: "",
    tracking: {
      mode: "static",
      tool: "highlight",
      selectedTrackIds: [],
      prompt: null,
      interaction: null,
      job: null,
      error: "",
      groundTruth: {
        byItemId: {},
      },
      provider: {
        status: "unchecked",
        available: false,
        name: "Local tracking companion",
        version: "",
        source: "none",
        error: "",
      },
    },
    spatial: {
      panel: "tracking",
      calibration: null,
      draftPoints: [],
      selectedLandmarkId: "corner-home-left",
      captureLandmarkId: "",
      pitchLengthM: 105,
      pitchWidthM: 68,
      unitAIds: [],
      unitBIds: [],
      loading: false,
      saving: false,
      error: "",
    },
    thumbnails: {},
    thumbnailCache: { count: 0, bytes: 0, maxItems: 600, maxBytes: 35 * 1024 * 1024 },
    presenterIndex: 0,
    sourceClips: [],
    sourceTotal: 0,
    sourceOffset: 0,
    sourceHasMore: false,
    sourceFilters: {
      search: "",
      phase: "",
      outcome: "",
      playerId: "",
      tag: "",
      matchId: "",
      date: "",
      type: "all",
      limit: 80,
    },
    activeSmartCollectionId: "",
    sharePanelTargetId: "",
    smartCollectionDraft: {
      title: "",
      description: "",
      visibility: "coach-analyst",
      sortMode: "newest",
      pinned: false,
      targetType: "role",
      targetId: "",
      accessLevel: "view",
      shareTargets: defaultShareTargets("coach-analyst"),
    },
    presentationShareDraft: {
      targetType: "role",
      targetId: "",
      accessLevel: "view",
    },
    presentationAccessOpen: false,
    current: createDefaultPresentation(),
    error: "",
  };
}

export function normalizePresentation(value = {}) {
  const fallback = createDefaultPresentation();
  const sections = Array.isArray(value.sections) && value.sections.length
    ? value.sections.map(normalizePresentationSection)
    : fallback.sections;
  return {
    ...fallback,
    id: stringValue(value.id),
    title: stringValue(value.title) || fallback.title,
    purpose: stringValue(value.purpose) || fallback.purpose,
    status: stringValue(value.status) || fallback.status,
    notes: stringValue(value.notes),
    metadata: value.metadata || {},
    sections,
    shareTargets: Array.isArray(value.shareTargets) ? value.shareTargets : [],
    smartCollections: Array.isArray(value.smartCollections) ? value.smartCollections : [],
  };
}

export function normalizeShareTarget(target = {}) {
  const targetType = stringValue(target.targetType || target.target_type || target.type) || "role";
  const targetId = stringValue(target.targetId || target.target_id || target.id);
  if (!targetId) return null;
  return {
    id: stringValue(target.id || target.shareTargetId || target.share_target_id),
    targetType,
    targetId,
    accessLevel: stringValue(target.accessLevel || target.access_level) || "view",
    metadata: target.metadata || {},
  };
}

export function defaultShareTargets(visibility = "coach-analyst") {
  if (visibility === "private") return [];
  if (visibility === "team") return [{ targetType: "team", targetId: "team", accessLevel: "view" }];
  if (visibility === "player-safe") return [{ targetType: "role", targetId: "player", accessLevel: "view" }];
  return [
    { targetType: "role", targetId: "coach", accessLevel: "edit" },
    { targetType: "role", targetId: "analyst", accessLevel: "edit" },
  ];
}

export function normalizeSmartCollection(collection = {}) {
  const metadata = collection.metadata || {};
  const shareTargets = Array.isArray(collection.shareTargets || collection.share_targets)
    ? (collection.shareTargets || collection.share_targets).map(normalizeShareTarget).filter(Boolean)
    : defaultShareTargets(collection.visibility || metadata.visibility || "coach-analyst");
  return {
    id: stringValue(collection.id || collection.collectionId || collection.collection_id),
    presentationId: stringValue(collection.presentationId || collection.presentation_id),
    title: stringValue(collection.title) || "Smart collection",
    description: stringValue(collection.description),
    collectionType: stringValue(collection.collectionType || collection.collection_type) || "smart",
    visibility: stringValue(collection.visibility || metadata.visibility) || "coach-analyst",
    sortMode: stringValue(collection.sortMode || collection.sort_mode || metadata.sortMode) || "newest",
    searchJson: collection.searchJson || collection.search_json || collection.search || {},
    isShared: collection.isShared !== false && collection.is_shared !== false,
    metadata: {
      ...metadata,
      pinned: booleanValue(metadata.pinned, false),
    },
    shareTargets,
    updatedAt: stringValue(collection.updatedAt || collection.updated_at),
  };
}

export function normalizePresentationSection(section = {}, index = 0) {
  return {
    id: stringValue(section.id) || localId("section"),
    title: stringValue(section.title) || "Presentation section",
    sectionType: stringValue(section.sectionType || section.section_type) || "custom",
    sortOrder: numberValue(section.sortOrder ?? section.sort_order, index),
    coachNote: stringValue(section.coachNote || section.coach_note || section.note),
    metadata: section.metadata || {},
    items: Array.isArray(section.items) ? section.items.map(normalizePresentationItem).filter(Boolean) : [],
  };
}

export function normalizePresentationItem(item = {}, index = 0) {
  const clipId = stringValue(item.clipId || item.clip_instance_id || item.clipInstanceId);
  if (!clipId) return null;
  return {
    id: stringValue(item.id) || localId("item"),
    clipId,
    sortOrder: numberValue(item.sortOrder ?? item.sort_order, index),
    customTitle: stringValue(item.customTitle || item.custom_title || item.title),
    coachNote: stringValue(item.coachNote || item.coach_note || item.note),
    startMs: item.startMs ?? item.start_ms ?? null,
    endMs: item.endMs ?? item.end_ms ?? null,
    freezePoints: Array.isArray(item.freezePoints || item.freeze_points_json) ? (item.freezePoints || item.freeze_points_json) : [],
    metadata: item.metadata || {},
    clip: item.clip || null,
    drawings: Array.isArray(item.drawings || item.drawingLayers || item.drawing_layers)
      ? (item.drawings || item.drawingLayers || item.drawing_layers).map(normalizeDrawingLayer)
      : [],
    objectTracks: Array.isArray(item.objectTracks || item.object_tracks)
      ? (item.objectTracks || item.object_tracks)
      : [],
    dynamicGraphics: Array.isArray(item.dynamicGraphics || item.dynamic_graphics)
      ? (item.dynamicGraphics || item.dynamic_graphics)
      : [],
  };
}

export function normalizeDrawingLayer(layer = {}, index = 0) {
  const tool = normalizePresentationDrawingTool(layer.tool);
  return {
    id: stringValue(layer.id) || localId("drawing"),
    presentationId: stringValue(layer.presentationId || layer.presentation_id),
    presentationItemId: stringValue(layer.presentationItemId || layer.presentation_item_id || layer.itemId),
    clipId: stringValue(layer.clipId || layer.clip_instance_id || layer.clipInstanceId),
    timestampMs: numberValue(layer.timestampMs ?? layer.timestamp_ms, 0),
    durationMs: layer.durationMs ?? layer.duration_ms ?? null,
    tool,
    geometry: normalizeDrawingGeometry(tool, layer.geometry || layer.geometryJson || layer.geometry_json || {}),
    style: layer.style || layer.styleJson || layer.style_json || {},
    text: stringValue(layer.text || layer.layerText || layer.layer_text),
    sortOrder: numberValue(layer.sortOrder ?? layer.sort_order, index),
    metadata: layer.metadata || {},
  };
}

export function presentationQueue(presentation = {}) {
  return (presentation.sections || []).flatMap((section) => (
    (section.items || []).map((item, index) => ({
      ...item,
      index,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionNote: section.coachNote || "",
    }))
  ));
}

export function selectedPresentationItem(presentation = {}, selectedItemId = "", selectedClipId = "") {
  const queue = presentationQueue(presentation);
  return queue.find((item) => item.id === selectedItemId)
    || queue.find((item) => item.clipId === selectedClipId)
    || queue[0]
    || null;
}

export function addPresentationSection(presentation = {}) {
  const sections = presentation.sections || [];
  const section = {
    id: localId("section"),
    title: `Section ${sections.length + 1}`,
    sectionType: "custom",
    sortOrder: sections.length,
    coachNote: "",
    items: [],
  };
  return { ...presentation, sections: [...sections, section] };
}

export function updatePresentationSection(presentation = {}, sectionId = "", patch = {}) {
  return {
    ...presentation,
    sections: (presentation.sections || []).map((section) => (
      section.id === sectionId ? { ...section, ...patch } : section
    )),
  };
}

export function addClipToPresentation(presentation = {}, sectionId = "", clip = {}) {
  const clipId = stringValue(clip.id || clip.clipId);
  if (!clipId) return presentation;
  return {
    ...presentation,
    sections: (presentation.sections || []).map((section) => {
      if (section.id !== sectionId) return section;
      if ((section.items || []).some((item) => item.clipId === clipId)) return section;
      const item = normalizePresentationItem({
        id: localId("item"),
        clipId,
        sortOrder: (section.items || []).length,
        customTitle: clip.phase ? `${clip.phase} / ${clip.outcome || "Neutral"}` : "",
        clip,
      });
      return { ...section, items: [...(section.items || []), item] };
    }),
  };
}

export function addClipsToPresentation(presentation = {}, sectionId = "", clips = []) {
  return (Array.isArray(clips) ? clips : []).reduce(
    (current, clip) => addClipToPresentation(current, sectionId, clip),
    presentation,
  );
}

export function updatePresentationItem(presentation = {}, itemId = "", patch = {}) {
  return {
    ...presentation,
    sections: (presentation.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })),
  };
}

export function removePresentationItem(presentation = {}, itemId = "") {
  return {
    ...presentation,
    sections: (presentation.sections || []).map((section) => ({
      ...section,
      items: (section.items || [])
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, sortOrder: index })),
    })),
  };
}

export function movePresentationItem(presentation = {}, itemId = "", direction = 0) {
  return {
    ...presentation,
    sections: (presentation.sections || []).map((section) => {
      const items = [...(section.items || [])];
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return section;
      const nextIndex = Math.max(0, Math.min(items.length - 1, index + direction));
      if (nextIndex === index) return section;
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);
      return { ...section, items: items.map((entry, order) => ({ ...entry, sortOrder: order })) };
    }),
  };
}

export function movePresentationItemToSection(presentation = {}, itemId = "", targetSectionId = "", targetIndex = 0) {
  let movingItem = null;
  const sectionsWithoutItem = (presentation.sections || []).map((section) => {
    const items = (section.items || []).filter((item) => {
      if (item.id !== itemId) return true;
      movingItem = item;
      return false;
    });
    return { ...section, items: items.map((item, index) => ({ ...item, sortOrder: index })) };
  });
  if (!movingItem) return presentation;
  return {
    ...presentation,
    sections: sectionsWithoutItem.map((section) => {
      if (section.id !== targetSectionId) return section;
      const items = [...(section.items || [])];
      const index = Math.max(0, Math.min(items.length, Math.floor(Number(targetIndex) || 0)));
      items.splice(index, 0, movingItem);
      return { ...section, items: items.map((item, sortOrder) => ({ ...item, sortOrder })) };
    }),
  };
}

export function addDrawingLayerToItem(presentation = {}, itemId = "", layer = {}) {
  const normalized = normalizeDrawingLayer(layer);
  return updatePresentationItem(presentation, itemId, {
    drawings: [
      ...((presentationQueue(presentation).find((item) => item.id === itemId)?.drawings) || []),
      normalized,
    ],
  });
}

export function removeDrawingLayerFromItem(presentation = {}, itemId = "", layerId = "") {
  const item = presentationQueue(presentation).find((entry) => entry.id === itemId);
  if (!item) return presentation;
  return updatePresentationItem(presentation, itemId, {
    drawings: (item.drawings || []).filter((layer) => layer.id !== layerId),
  });
}

export function updateDrawingLayerInItem(presentation = {}, itemId = "", layerId = "", patch = {}) {
  const item = presentationQueue(presentation).find((entry) => entry.id === itemId);
  if (!item) return presentation;
  return updatePresentationItem(presentation, itemId, {
    drawings: (item.drawings || []).map((layer) => (
      layer.id === layerId ? normalizeDrawingLayer({ ...layer, ...patch }) : layer
    )),
  });
}

export function buildPresentationPayload(presentation = {}) {
  const normalized = normalizePresentation(presentation);
  return {
    id: normalized.id,
    title: normalized.title,
    purpose: normalized.purpose,
    status: normalized.status,
    notes: normalized.notes,
    metadata: normalized.metadata || {},
    shareTargets: normalized.shareTargets || [],
    sections: normalized.sections.map((section, sectionIndex) => ({
      id: section.id,
      title: section.title,
      sectionType: section.sectionType,
      sortOrder: sectionIndex,
      coachNote: section.coachNote,
      metadata: section.metadata || {},
      items: (section.items || []).map((item, itemIndex) => ({
        id: item.id,
        clipId: item.clipId,
        sortOrder: itemIndex,
        customTitle: item.customTitle,
        coachNote: item.coachNote,
        startMs: item.startMs,
        endMs: item.endMs,
        freezePoints: item.freezePoints || [],
        metadata: item.metadata || {},
        drawings: (item.drawings || []).map((layer, layerIndex) => ({
          ...layer,
          presentationId: normalized.id,
          presentationItemId: item.id,
          clipId: item.clipId,
          sortOrder: layerIndex,
        })),
      })),
    })),
  };
}

export function buildSmartCollectionPayload(values = {}, filters = {}, presentationId = "") {
  const normalized = normalizeSmartCollection({
    ...values,
    searchJson: values.searchJson || values.search || filters,
    metadata: {
      ...(values.metadata || {}),
      pinned: booleanValue(values.pinned ?? values.metadata?.pinned, false),
    },
    shareTargets: Array.isArray(values.shareTargets) ? values.shareTargets : defaultShareTargets(values.visibility || "coach-analyst"),
  });
  return {
    id: normalized.id,
    presentationId: normalized.presentationId || presentationId || "",
    title: normalized.title || smartCollectionTitle(filters),
    description: normalized.description || "Live playlist generated from Data Explorer filters.",
    visibility: normalized.visibility,
    sortMode: normalized.sortMode,
    search: normalized.searchJson || filters,
    metadata: normalized.metadata,
    shareTargets: normalized.shareTargets,
  };
}

export function duplicateSmartCollection(collection = {}) {
  const normalized = normalizeSmartCollection(collection);
  return {
    ...normalized,
    id: "",
    title: `${normalized.title} copy`,
    metadata: { ...(normalized.metadata || {}), pinned: false, duplicatedFrom: normalized.id || "" },
  };
}

export function toggleSmartCollectionPinned(collection = {}) {
  const normalized = normalizeSmartCollection(collection);
  return {
    ...normalized,
    metadata: { ...(normalized.metadata || {}), pinned: !normalized.metadata?.pinned },
    pinned: !normalized.metadata?.pinned,
  };
}

export function smartCollectionShareLabel(collection = {}) {
  const targets = Array.isArray(collection.shareTargets) ? collection.shareTargets : [];
  if (!targets.length) return "Private";
  const roles = targets.filter((target) => target.targetType === "role").map((target) => target.targetId);
  if (roles.includes("coach") && roles.includes("analyst")) return "Coaches + analysts";
  if (targets.some((target) => target.targetType === "team")) return "Team";
  if (targets.some((target) => target.targetType === "player")) return "Selected players";
  return `${targets.length} targets`;
}

export function smartCollectionTitle(filters = {}) {
  const parts = [filters.phase, filters.outcome, filters.playerId, filters.tag, filters.date]
    .map((value) => stringValue(value))
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : "Smart clip collection";
}
