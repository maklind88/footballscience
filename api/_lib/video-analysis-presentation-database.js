const {
  asLimit,
  asMs,
  actorScope,
  buildTeamParams,
  insertRow,
  normalizeNote,
  normalizeText,
  normalizeUuid,
  patchRows,
  rejectForbiddenPayload,
  selectRows,
} = require("./video-analysis-database-core.js");

const VIDEO_ANALYSIS_SCHEMA = "footballscience-video-analysis-v2";
const PRESENTATION_PURPOSES = new Set(["team-meeting", "unit-meeting", "player-review", "analysis", "custom"]);
const SECTION_TYPES = new Set(["opening", "team", "unit", "player", "phase", "set-piece", "custom"]);
const DRAWING_TOOLS = new Set(["freehand", "arrow", "circle", "spotlight", "text", "freeze", "zoom"]);
const SHARE_TARGET_TYPES = new Set(["team", "role", "group", "player", "user"]);
const SHARE_ACCESS_LEVELS = new Set(["view", "present", "edit"]);
const COLLECTION_VISIBILITY = new Set(["coach-analyst", "team", "private", "custom", "player-safe"]);
const COLLECTION_SORT_MODES = new Set(["newest", "oldest", "match-date", "clip-time", "custom"]);

function rowList(result) {
  return result.ok && Array.isArray(result.payload) ? result.payload : [];
}

function normalizeStatus(value = "", fallback = "draft") {
  const status = normalizeText(value, 40).toLowerCase();
  return ["draft", "active", "archived"].includes(status) ? status : fallback;
}

function normalizeActiveStatus(value = "", fallback = "active") {
  const status = normalizeText(value, 40).toLowerCase();
  return ["active", "archived"].includes(status) ? status : fallback;
}

function normalizePurpose(value = "") {
  const purpose = normalizeText(value || "team-meeting", 80).toLowerCase();
  return PRESENTATION_PURPOSES.has(purpose) ? purpose : "custom";
}

function normalizeSectionType(value = "") {
  const type = normalizeText(value || "custom", 80).toLowerCase();
  return SECTION_TYPES.has(type) ? type : "custom";
}

function normalizeDrawingTool(value = "") {
  const tool = normalizeText(value || "arrow", 40).toLowerCase();
  return DRAWING_TOOLS.has(tool) ? tool : "arrow";
}

function normalizeShareTargetType(value = "") {
  const type = normalizeText(value || "team", 40).toLowerCase();
  return SHARE_TARGET_TYPES.has(type) ? type : "team";
}

function normalizeAccessLevel(value = "") {
  const level = normalizeText(value || "view", 40).toLowerCase();
  return SHARE_ACCESS_LEVELS.has(level) ? level : "view";
}

function normalizeCollectionVisibility(value = "") {
  const visibility = normalizeText(value || "coach-analyst", 80).toLowerCase();
  return COLLECTION_VISIBILITY.has(visibility) ? visibility : "coach-analyst";
}

function normalizeCollectionSortMode(value = "") {
  const mode = normalizeText(value || "newest", 80).toLowerCase();
  return COLLECTION_SORT_MODES.has(mode) ? mode : "newest";
}

function normalizeSortOrder(value, index = 0) {
  const order = Math.floor(Number(value ?? index));
  return Number.isFinite(order) && order >= 0 ? order : index;
}

function normalizeObject(value = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeArray(value = []) {
  return Array.isArray(value) ? value : [];
}

function drawingCoordinate(value, fallback = 50) {
  const number = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? number : fallback));
}

function normalizeDrawingGeometry(tool = "arrow", value = {}) {
  const geometry = normalizeObject(value);
  if (tool !== "freehand") return geometry;
  return {
    points: normalizeArray(geometry.points).slice(0, 256).map((point = {}) => ({
      x: drawingCoordinate(point.x),
      y: drawingCoordinate(point.y),
    })),
  };
}

function normalizeFreezePoints(value = []) {
  return normalizeArray(value)
    .map((point = {}) => ({
      timestampMs: asMs(point.timestampMs ?? point.timestamp_ms, 0),
      label: normalizeText(point.label, 120),
    }))
    .slice(0, 40);
}

function buildIdParams(scope = {}, id = "") {
  const params = buildTeamParams(scope);
  params.set("id", `eq.${id}`);
  return params;
}

function scopedPresentationParams(scope = {}, presentationId = "") {
  const params = buildTeamParams(scope);
  params.set("presentation_id", `eq.${presentationId}`);
  return params;
}

function normalizePresentationPayload(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const title = normalizeText(payload.title || "Football Science Review", 180);
  if (!title) {
    const error = new Error("Presentation title is required.");
    error.status = 400;
    throw error;
  }
  return {
    ...scope,
    id: normalizeUuid(payload.id || payload.presentationId || payload.presentation_id),
    title,
    purpose: normalizePurpose(payload.purpose),
    ownerId: normalizeText(payload.ownerId || payload.owner_id || scope.actorId, 160) || null,
    status: normalizeStatus(payload.status, "draft"),
    notes: normalizeNote(payload.notes, 5000) || null,
    metadata: normalizeObject(payload.metadata),
    sections: normalizeArray(payload.sections).map(normalizePresentationSection).filter(Boolean).slice(0, 80),
    shareTargets: normalizeArray(payload.shareTargets || payload.share_targets).map(normalizeShareTarget).filter(Boolean).slice(0, 200),
  };
}

function normalizePresentationSection(section = {}, index = 0) {
  const title = normalizeText(section.title || "Presentation section", 180);
  if (!title) return null;
  return {
    id: normalizeUuid(section.id || section.sectionId || section.section_id),
    title,
    sectionType: normalizeSectionType(section.sectionType || section.section_type || section.type),
    sortOrder: normalizeSortOrder(section.sortOrder ?? section.sort_order, index),
    coachNote: normalizeNote(section.coachNote || section.coach_note || section.note, 4000) || null,
    status: normalizeActiveStatus(section.status, "active"),
    metadata: normalizeObject(section.metadata),
    items: normalizeArray(section.items).map(normalizePresentationItem).filter(Boolean).slice(0, 500),
  };
}

function normalizePresentationItem(item = {}, index = 0) {
  const clipId = normalizeUuid(item.clipId || item.clip_instance_id || item.clipInstanceId);
  if (!clipId) return null;
  const startMs = item.startMs ?? item.start_ms;
  const endMs = item.endMs ?? item.end_ms;
  return {
    id: normalizeUuid(item.id || item.itemId || item.item_id),
    clipId,
    sortOrder: normalizeSortOrder(item.sortOrder ?? item.sort_order, index),
    customTitle: normalizeText(item.customTitle || item.custom_title || item.title, 180) || null,
    coachNote: normalizeNote(item.coachNote || item.coach_note || item.note, 3000) || null,
    startMs: startMs === undefined || startMs === null || startMs === "" ? null : asMs(startMs, 0),
    endMs: endMs === undefined || endMs === null || endMs === "" ? null : asMs(endMs, 0),
    freezePoints: normalizeFreezePoints(item.freezePoints || item.freeze_points_json),
    status: normalizeActiveStatus(item.status, "active"),
    metadata: normalizeObject(item.metadata),
    drawings: normalizeArray(item.drawings || item.drawingLayers || item.drawing_layers).map(normalizeDrawingLayer).filter(Boolean).slice(0, 80),
  };
}

function normalizeDrawingLayer(layer = {}, index = 0) {
  const clipId = normalizeUuid(layer.clipId || layer.clip_instance_id || layer.clipInstanceId);
  const tool = normalizeDrawingTool(layer.tool);
  return {
    id: normalizeUuid(layer.id || layer.layerId || layer.layer_id),
    presentationId: normalizeUuid(layer.presentationId || layer.presentation_id),
    presentationItemId: normalizeUuid(layer.presentationItemId || layer.presentation_item_id || layer.itemId),
    clipId,
    timestampMs: asMs(layer.timestampMs ?? layer.timestamp_ms, 0),
    durationMs: layer.durationMs === undefined && layer.duration_ms === undefined
      ? null
      : asMs(layer.durationMs ?? layer.duration_ms, 0),
    tool,
    geometry: normalizeDrawingGeometry(tool, layer.geometry || layer.geometryJson || layer.geometry_json),
    style: normalizeObject(layer.style || layer.styleJson || layer.style_json),
    text: normalizeNote(layer.text || layer.layerText || layer.layer_text, 500) || null,
    sortOrder: normalizeSortOrder(layer.sortOrder ?? layer.sort_order, index),
    status: normalizeActiveStatus(layer.status, "active"),
    metadata: normalizeObject(layer.metadata),
  };
}

function normalizeSmartCollection(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const title = normalizeText(payload.title || "Smart collection", 180);
  if (!title) {
    const error = new Error("Smart collection title is required.");
    error.status = 400;
    throw error;
  }
  return {
    ...scope,
    id: normalizeUuid(payload.id || payload.collectionId || payload.collection_id),
    presentationId: normalizeUuid(payload.presentationId || payload.presentation_id),
    title,
    description: normalizeNote(payload.description, 1000) || null,
    collectionType: normalizeText(payload.collectionType || payload.collection_type || "smart", 40).toLowerCase() === "manual" ? "manual" : "smart",
    visibility: normalizeCollectionVisibility(payload.visibility || payload.metadata?.visibility),
    sortMode: normalizeCollectionSortMode(payload.sortMode || payload.sort_mode || payload.metadata?.sortMode),
    searchJson: normalizeObject(payload.search || payload.searchJson || payload.search_json),
    isShared: payload.isShared !== false && payload.is_shared !== false,
    status: normalizeActiveStatus(payload.status, "active"),
    metadata: normalizeObject(payload.metadata),
    shareTargets: normalizeArray(payload.shareTargets || payload.share_targets).map(normalizeShareTarget).filter(Boolean).slice(0, 200),
  };
}

function normalizeShareTarget(target = {}) {
  const targetId = normalizeText(target.targetId || target.target_id || target.id, 180);
  if (!targetId) return null;
  return {
    id: normalizeUuid(target.id || target.shareTargetId || target.share_target_id),
    targetType: normalizeShareTargetType(target.targetType || target.target_type || target.type),
    targetId,
    accessLevel: normalizeAccessLevel(target.accessLevel || target.access_level),
    status: normalizeActiveStatus(target.status, "active"),
    metadata: normalizeObject(target.metadata),
  };
}

function isMissingPresentationSchema(result = {}) {
  const reason = String(result.reason || result.payload?.message || result.payload?.hint || "");
  return result.status === 404 || /video_presentations|video_presentation_sections|video_drawing_layers|schema cache|relation .* does not exist/i.test(reason);
}

function mapPresentationRow(row = {}) {
  return {
    id: row.id || "",
    title: row.title || "Football Science Review",
    purpose: row.purpose || "team-meeting",
    ownerId: row.owner_id || "",
    status: row.status || "draft",
    notes: row.notes || "",
    metadata: row.metadata || {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function mapSectionRow(row = {}, items = []) {
  return {
    id: row.id || "",
    title: row.title || "Presentation section",
    sectionType: row.section_type || "custom",
    sortOrder: row.sort_order || 0,
    coachNote: row.coach_note || "",
    metadata: row.metadata || {},
    items,
  };
}

function mapItemRow(row = {}, clip = null, drawings = []) {
  return {
    id: row.id || "",
    clipId: row.clip_instance_id || "",
    sortOrder: row.sort_order || 0,
    customTitle: row.custom_title || "",
    coachNote: row.coach_note || "",
    startMs: row.start_ms,
    endMs: row.end_ms,
    freezePoints: row.freeze_points_json || [],
    metadata: row.metadata || {},
    clip,
    drawings,
  };
}

function mapDrawingRow(row = {}) {
  return {
    id: row.id || "",
    presentationId: row.presentation_id || "",
    presentationItemId: row.presentation_item_id || "",
    clipId: row.clip_instance_id || "",
    timestampMs: row.timestamp_ms || 0,
    durationMs: row.duration_ms,
    tool: row.tool || "arrow",
    geometry: row.geometry_json || {},
    style: row.style_json || {},
    text: row.layer_text || "",
    sortOrder: row.sort_order || 0,
    metadata: row.metadata || {},
  };
}

function mapSmartCollectionRow(row = {}, shareTargets = []) {
  return {
    id: row.id || "",
    presentationId: row.presentation_id || "",
    title: row.title || "Smart collection",
    description: row.description || "",
    collectionType: row.collection_type || "smart",
    visibility: row.visibility || "coach-analyst",
    sortMode: row.sort_mode || "newest",
    searchJson: row.search_json || {},
    isShared: row.is_shared !== false,
    metadata: row.metadata || {},
    shareTargets,
    updatedAt: row.updated_at || "",
  };
}

function mapSmartCollectionShareTargetRow(row = {}) {
  return {
    id: row.id || "",
    collectionId: row.collection_id || "",
    targetType: row.target_type || "role",
    targetId: row.target_id || "",
    accessLevel: row.access_level || "view",
    metadata: row.metadata || {},
  };
}

function mapShareTargetRow(row = {}) {
  return {
    id: row.id || "",
    presentationId: row.presentation_id || "",
    targetType: row.target_type || "team",
    targetId: row.target_id || "",
    accessLevel: row.access_level || "view",
    metadata: row.metadata || {},
  };
}

async function listPresentations(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "neq.archived");
  params.set("order", "updated_at.desc,id.desc");
  params.set("limit", String(asLimit(query.limit, 40)));
  const result = await selectRows("video_presentations", params);
  if (!result.ok) {
    if (isMissingPresentationSchema(result)) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, presentations: [], smartCollections: [] } };
    return result;
  }
  const smartCollections = await listSmartCollections(query, actor);
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      presentations: rowList(result).map(mapPresentationRow),
      smartCollections: smartCollections.ok ? smartCollections.payload.smartCollections : [],
    },
  };
}

async function listSmartCollections(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("status", "eq.active");
  if (normalizeUuid(query.presentationId || query.presentation_id)) {
    params.set("presentation_id", `eq.${normalizeUuid(query.presentationId || query.presentation_id)}`);
  }
  params.set("order", "updated_at.desc,id.desc");
  params.set("limit", String(asLimit(query.limit, 60)));
  const result = await selectRows("video_smart_collections", params);
  if (!result.ok) {
    if (isMissingPresentationSchema(result)) return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, smartCollections: [] } };
    return result;
  }
  const rows = rowList(result);
  const sharesByCollection = await shareTargetsForCollections(rows.map((row) => row.id).filter(Boolean), scope);
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      smartCollections: rows.map((row) => mapSmartCollectionRow(row, sharesByCollection.get(row.id) || [])),
    },
  };
}

async function shareTargetsForCollections(collectionIds = [], scope = {}) {
  const map = new Map();
  if (!collectionIds.length) return map;
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("collection_id", `in.(${collectionIds.join(",")})`);
  params.set("status", "eq.active");
  params.set("order", "created_at.asc,id.asc");
  const result = await selectRows("video_smart_collection_share_targets", params);
  if (!result.ok) return map;
  for (const row of rowList(result).map(mapSmartCollectionShareTargetRow)) {
    const list = map.get(row.collectionId) || [];
    list.push(row);
    map.set(row.collectionId, list);
  }
  return map;
}

async function getPresentation(query = {}, actor = {}) {
  const scope = actorScope(actor);
  const id = normalizeUuid(query.id || query.presentationId || query.presentation_id);
  if (!id) return { ok: false, status: 400, reason: "presentation id is required." };
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `eq.${id}`);
  params.set("status", "neq.archived");
  params.set("limit", "1");
  const presentationResult = await selectRows("video_presentations", params);
  if (!presentationResult.ok) return presentationResult;
  const presentation = rowList(presentationResult)[0];
  if (!presentation) return { ok: false, status: 404, reason: "Presentation not found." };
  const [sectionsResult, itemsResult, drawingsResult, sharesResult, smartResult] = await Promise.all([
    selectRows("video_presentation_sections", withPresentationOrder("video_presentation_sections", scope, id)),
    selectRows("video_presentation_items", withPresentationOrder("video_presentation_items", scope, id)),
    selectRows("video_drawing_layers", withPresentationOrder("video_drawing_layers", scope, id)),
    selectRows("video_presentation_share_targets", withPresentationOrder("video_presentation_share_targets", scope, id)),
    listSmartCollections({ presentationId: id }, actor),
  ]);
  if (!sectionsResult.ok) return sectionsResult;
  if (!itemsResult.ok) return itemsResult;
  if (!drawingsResult.ok) return drawingsResult;
  if (!sharesResult.ok) return sharesResult;

  const clipsById = await clipsForItems(rowList(itemsResult), scope);
  const drawingsByItem = new Map();
  for (const row of rowList(drawingsResult).map(mapDrawingRow)) {
    const list = drawingsByItem.get(row.presentationItemId) || [];
    list.push(row);
    drawingsByItem.set(row.presentationItemId, list);
  }
  const itemsBySection = new Map();
  for (const row of rowList(itemsResult)) {
    const mapped = mapItemRow(row, clipsById.get(row.clip_instance_id) || null, drawingsByItem.get(row.id) || []);
    const list = itemsBySection.get(row.section_id) || [];
    list.push(mapped);
    itemsBySection.set(row.section_id, list);
  }
  const sections = rowList(sectionsResult).map((row) => mapSectionRow(row, itemsBySection.get(row.id) || []));
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      presentation: {
        ...mapPresentationRow(presentation),
        sections,
        shareTargets: rowList(sharesResult).map(mapShareTargetRow),
        smartCollections: smartResult.ok ? smartResult.payload.smartCollections : [],
      },
    },
  };
}

function withPresentationOrder(table = "", scope = {}, presentationId = "") {
  const params = scopedPresentationParams(scope, presentationId);
  params.set("select", "*");
  params.set("status", "eq.active");
  if (table === "video_presentation_sections") params.set("order", "sort_order.asc,id.asc");
  else if (table === "video_presentation_items") params.set("order", "section_id.asc,sort_order.asc,id.asc");
  else if (table === "video_drawing_layers") params.set("order", "presentation_item_id.asc,timestamp_ms.asc,sort_order.asc,id.asc");
  else params.set("order", "created_at.asc,id.asc");
  return params;
}

async function clipsForItems(items = [], scope = {}) {
  const ids = Array.from(new Set(items.map((item) => item.clip_instance_id).filter(Boolean)));
  if (!ids.length) return new Map();
  const params = buildTeamParams(scope);
  params.set("select", "*");
  params.set("id", `in.(${ids.join(",")})`);
  const result = await selectRows("video_clip_instances", params);
  const map = new Map();
  if (result.ok) {
    for (const row of rowList(result)) map.set(row.id, row);
  }
  return map;
}

async function savePresentation(payload = {}, actor = {}) {
  const presentation = normalizePresentationPayload(payload, actor);
  const row = {
    organization_id: presentation.organizationId,
    team_id: presentation.teamId,
    title: presentation.title,
    purpose: presentation.purpose,
    owner_id: presentation.ownerId,
    status: presentation.status,
    notes: presentation.notes,
    created_by: presentation.actorId,
    metadata: presentation.metadata,
  };
  const presentationResult = presentation.id
    ? await patchRows("video_presentations", buildIdParams(presentation, presentation.id), row)
    : await insertRow("video_presentations", row);
  if (!presentationResult.ok) return presentationResult;
  const savedPresentation = presentationResult.payload?.[0];
  if (!savedPresentation?.id) return { ok: false, status: 500, reason: "Presentation could not be saved." };
  const sectionsResult = await savePresentationSections(presentation.sections, savedPresentation.id, presentation);
  if (!sectionsResult.ok) return sectionsResult;
  const sharesResult = presentation.shareTargets.length
    ? await saveShareTargets({ presentationId: savedPresentation.id, targets: presentation.shareTargets }, actor)
    : { ok: true };
  if (!sharesResult.ok) return sharesResult;
  return getPresentation({ id: savedPresentation.id }, actor);
}

async function savePresentationSections(sections = [], presentationId = "", scope = {}) {
  const savedSectionIds = [];
  const savedItemIds = [];
  for (const [index, section] of sections.entries()) {
    const sectionRow = {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      presentation_id: presentationId,
      title: section.title,
      section_type: section.sectionType,
      sort_order: normalizeSortOrder(section.sortOrder, index),
      coach_note: section.coachNote,
      status: section.status,
      created_by: scope.actorId,
      metadata: section.metadata,
    };
    const sectionResult = section.id
      ? await patchRows("video_presentation_sections", buildIdParams(scope, section.id), sectionRow)
      : await insertRow("video_presentation_sections", sectionRow);
    if (!sectionResult.ok) return sectionResult;
    const savedSection = sectionResult.payload?.[0];
    if (!savedSection?.id) return { ok: false, status: 500, reason: "Presentation section could not be saved." };
    savedSectionIds.push(savedSection.id);
    const itemsResult = await savePresentationItems(section.items, presentationId, savedSection.id, scope);
    if (!itemsResult.ok) return itemsResult;
    savedItemIds.push(...itemsResult.payload);
  }
  const archiveSections = await archiveMissing("video_presentation_sections", presentationId, scope, savedSectionIds);
  if (!archiveSections.ok) return archiveSections;
  const archiveItems = await archiveMissing("video_presentation_items", presentationId, scope, savedItemIds);
  if (!archiveItems.ok) return archiveItems;
  return { ok: true, payload: { sectionIds: savedSectionIds, itemIds: savedItemIds } };
}

async function savePresentationItems(items = [], presentationId = "", sectionId = "", scope = {}) {
  const savedItemIds = [];
  for (const [index, item] of items.entries()) {
    const itemRow = {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      presentation_id: presentationId,
      section_id: sectionId,
      clip_instance_id: item.clipId,
      sort_order: normalizeSortOrder(item.sortOrder, index),
      custom_title: item.customTitle,
      coach_note: item.coachNote,
      start_ms: item.startMs,
      end_ms: item.endMs,
      freeze_points_json: item.freezePoints,
      status: item.status,
      created_by: scope.actorId,
      metadata: item.metadata,
    };
    const itemResult = item.id
      ? await patchRows("video_presentation_items", buildIdParams(scope, item.id), itemRow)
      : await insertRow("video_presentation_items", itemRow);
    if (!itemResult.ok) return itemResult;
    const savedItem = itemResult.payload?.[0];
    if (!savedItem?.id) return { ok: false, status: 500, reason: "Presentation item could not be saved." };
    savedItemIds.push(savedItem.id);
    for (const drawing of item.drawings) {
      const drawingResult = await saveDrawingLayer({
        ...drawing,
        presentationId,
        presentationItemId: savedItem.id,
        clipId: item.clipId,
      }, { id: scope.actorId, clubId: scope.organizationId, teamId: scope.teamId });
      if (!drawingResult.ok) return drawingResult;
    }
  }
  return { ok: true, payload: savedItemIds };
}

async function archiveMissing(table = "", presentationId = "", scope = {}, keepIds = []) {
  const params = scopedPresentationParams(scope, presentationId);
  params.set("status", "eq.active");
  if (keepIds.length) params.set("id", `not.in.(${keepIds.join(",")})`);
  const result = await patchRows(table, params, { status: "archived", archived_at: new Date().toISOString() });
  return result.ok || result.status === 404 ? { ok: true, payload: [] } : result;
}

async function archivePresentation(payload = {}, actor = {}) {
  const scope = actorScope(actor);
  const id = normalizeUuid(payload.id || payload.presentationId || payload.presentation_id);
  if (!id) return { ok: false, status: 400, reason: "presentation id is required." };
  const result = await patchRows("video_presentations", buildIdParams(scope, id), {
    status: "archived",
    archived_at: new Date().toISOString(),
  });
  return result.ok ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, presentation: result.payload?.[0] || null } } : result;
}

async function saveSmartCollection(payload = {}, actor = {}) {
  const collection = normalizeSmartCollection(payload, actor);
  const row = {
    organization_id: collection.organizationId,
    team_id: collection.teamId,
    presentation_id: collection.presentationId || null,
    title: collection.title,
    description: collection.description,
    collection_type: collection.collectionType,
    visibility: collection.visibility,
    sort_mode: collection.sortMode,
    search_json: collection.searchJson,
    is_shared: collection.isShared,
    status: collection.status,
    created_by: collection.actorId,
    metadata: {
      ...collection.metadata,
      visibility: collection.visibility,
      sortMode: collection.sortMode,
    },
  };
  const result = collection.id
    ? await patchRows("video_smart_collections", buildIdParams(collection, collection.id), row)
    : await insertRow("video_smart_collections", row);
  if (!result.ok) return result;
  const saved = result.payload?.[0];
  if (!saved?.id) return { ok: false, status: 500, reason: "Smart collection could not be saved." };
  const targets = collection.shareTargets.length ? collection.shareTargets : defaultSmartCollectionShareTargets(collection.visibility);
  const shares = await saveSmartCollectionShareTargets({ collectionId: saved.id, targets }, actor);
  if (!shares.ok) return shares;
  return {
    ok: true,
    payload: {
      schema: VIDEO_ANALYSIS_SCHEMA,
      smartCollection: mapSmartCollectionRow(saved, shares.payload?.shareTargets || []),
    },
  };
}

function defaultSmartCollectionShareTargets(visibility = "coach-analyst") {
  if (visibility === "private") return [];
  if (visibility === "team") return [{ targetType: "team", targetId: "team", accessLevel: "view" }];
  if (visibility === "player-safe") return [{ targetType: "role", targetId: "player", accessLevel: "view" }];
  return [
    { targetType: "role", targetId: "coach", accessLevel: "edit" },
    { targetType: "role", targetId: "analyst", accessLevel: "edit" },
  ];
}

async function saveSmartCollectionShareTargets(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const collectionId = normalizeUuid(payload.collectionId || payload.collection_id);
  if (!collectionId) return { ok: false, status: 400, reason: "collection id is required." };
  const targets = normalizeArray(payload.targets || payload.shareTargets || payload.share_targets).map(normalizeShareTarget).filter(Boolean).slice(0, 200);
  const params = buildTeamParams(scope);
  params.set("collection_id", `eq.${collectionId}`);
  params.set("status", "eq.active");
  const archiveResult = await patchRows("video_smart_collection_share_targets", params, { status: "archived", archived_at: new Date().toISOString() });
  if (!archiveResult.ok && archiveResult.status !== 404) return archiveResult;
  const saved = [];
  for (const target of targets) {
    const result = await insertRow("video_smart_collection_share_targets", {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      collection_id: collectionId,
      target_type: target.targetType,
      target_id: target.targetId,
      access_level: target.accessLevel,
      status: target.status,
      created_by: scope.actorId,
      metadata: target.metadata,
    });
    if (!result.ok && result.status !== 409) return result;
    if (result.ok) saved.push(mapSmartCollectionShareTargetRow(result.payload?.[0] || target));
  }
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, shareTargets: saved } };
}

async function saveDrawingLayer(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const layer = normalizeDrawingLayer(payload);
  const presentationId = layer.presentationId || normalizeUuid(payload.presentationId || payload.presentation_id);
  if (!presentationId || !layer.clipId) return { ok: false, status: 400, reason: "presentation id and clip id are required." };
  const row = {
    organization_id: scope.organizationId,
    team_id: scope.teamId,
    presentation_id: presentationId,
    presentation_item_id: layer.presentationItemId || null,
    clip_instance_id: layer.clipId,
    timestamp_ms: layer.timestampMs,
    duration_ms: layer.durationMs,
    tool: layer.tool,
    geometry_json: layer.geometry,
    style_json: layer.style,
    layer_text: layer.text,
    sort_order: layer.sortOrder,
    status: layer.status,
    created_by: scope.actorId,
    metadata: layer.metadata,
  };
  const result = layer.id
    ? await patchRows("video_drawing_layers", buildIdParams(scope, layer.id), row)
    : await insertRow("video_drawing_layers", row);
  return result.ok
    ? { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, drawingLayer: mapDrawingRow(result.payload?.[0] || row) } }
    : result;
}

async function saveShareTargets(payload = {}, actor = {}) {
  rejectForbiddenPayload(payload);
  const scope = actorScope(actor);
  const presentationId = normalizeUuid(payload.presentationId || payload.presentation_id);
  if (!presentationId) return { ok: false, status: 400, reason: "presentation id is required." };
  const targets = normalizeArray(payload.targets || payload.shareTargets || payload.share_targets).map(normalizeShareTarget).filter(Boolean).slice(0, 200);
  const archiveResult = await archiveMissing("video_presentation_share_targets", presentationId, scope, []);
  if (!archiveResult.ok) return archiveResult;
  const saved = [];
  for (const target of targets) {
    const result = await insertRow("video_presentation_share_targets", {
      organization_id: scope.organizationId,
      team_id: scope.teamId,
      presentation_id: presentationId,
      target_type: target.targetType,
      target_id: target.targetId,
      access_level: target.accessLevel,
      status: target.status,
      created_by: scope.actorId,
      metadata: target.metadata,
    });
    if (!result.ok && result.status !== 409) return result;
    if (result.ok) saved.push(mapShareTargetRow(result.payload?.[0] || target));
  }
  return { ok: true, payload: { schema: VIDEO_ANALYSIS_SCHEMA, shareTargets: saved } };
}

module.exports = {
  archivePresentation,
  getPresentation,
  listPresentations,
  listSmartCollections,
  normalizeDrawingLayer,
  normalizePresentationPayload,
  normalizeSmartCollection,
  saveDrawingLayer,
  savePresentation,
  saveShareTargets,
  saveSmartCollectionShareTargets,
  saveSmartCollection,
};
