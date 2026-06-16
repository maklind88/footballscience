export const presentationModes = Object.freeze([
  { id: "builder", label: "Build" },
  { id: "draw", label: "Telestrate" },
  { id: "presenter", label: "Present" },
]);

export const presentationDrawingTools = Object.freeze([
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

export function normalizePresentationMode(mode = "") {
  return presentationModes.some((item) => item.id === mode) ? mode : "builder";
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
    mode: "builder",
    drawingTool: "arrow",
    drawingUndoStack: [],
    drawingRedoStack: [],
    drawingInteraction: null,
    selectedDrawingLayerId: "",
    thumbnails: {},
    presenterIndex: 0,
    sourceClips: [],
    sourceTotal: 0,
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
  };
}

export function normalizeDrawingLayer(layer = {}, index = 0) {
  return {
    id: stringValue(layer.id) || localId("drawing"),
    presentationId: stringValue(layer.presentationId || layer.presentation_id),
    presentationItemId: stringValue(layer.presentationItemId || layer.presentation_item_id || layer.itemId),
    clipId: stringValue(layer.clipId || layer.clip_instance_id || layer.clipInstanceId),
    timestampMs: numberValue(layer.timestampMs ?? layer.timestamp_ms, 0),
    durationMs: layer.durationMs ?? layer.duration_ms ?? null,
    tool: normalizePresentationDrawingTool(layer.tool),
    geometry: layer.geometry || layer.geometryJson || layer.geometry_json || {},
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

export function smartCollectionTitle(filters = {}) {
  const parts = [filters.phase, filters.outcome, filters.playerId, filters.tag, filters.date]
    .map((value) => stringValue(value))
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : "Smart clip collection";
}
