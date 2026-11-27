const { buildSupabaseKeyHeaders, readConfig } = require("./supabase-admin.js");
const { hasModulePermission } = require("../../src/core/permission-matrix.cjs");
const { normalizeGameModelUuid } = require("./game-model-scope.js");

const table = "game_model_items";
const columns = "id,kind,sub_phase_id,title,when_text,detail,position_ids,archived,revision";
const pageSize = 200;
const itemKinds = new Set(["team-principle", "mini-game-principle", "individual-action"]);

function failure(status, reason) {
  return { ok: false, status, reason };
}

function scopedQuery(scope) {
  return new URLSearchParams({ organization_id: `eq.${scope.organizationId}`, team_id: `eq.${scope.teamId}`, select: columns });
}

function isScoped(scope, action) {
  return Boolean(scope?.ok && normalizeGameModelUuid(scope.organizationId) && normalizeGameModelUuid(scope.teamId)
    && normalizeGameModelUuid(scope.actor?.id) && hasModulePermission(scope.actor, "game-model", action));
}

async function databaseRequest(query, options) {
  const config = options.config || readConfig();
  if (!config.url || !config.serviceRoleKey) return failure(503, "Game Model storage is unavailable.");
  try {
    const response = await (options.fetchImpl || fetch)(`${config.url}/rest/v1/${table}?${query.toString()}`, {
      method: options.method || "GET",
      headers: {
        ...buildSupabaseKeyHeaders(config.serviceRoleKey, { contentType: "application/json" }),
        Accept: "application/json",
        ...(options.method ? { Prefer: "return=representation" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const rows = await response.json();
    if (response.ok && Array.isArray(rows)) return { ok: true, rows };
    if (response.status === 409) return failure(409, "This Game Model item changed. Refresh it and try again.");
  } catch {
    return failure(503, "Game Model storage is unavailable.");
  }
  return failure(503, "Game Model storage is unavailable.");
}

function itemFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    subPhaseId: row.sub_phase_id,
    title: row.title,
    when: row.when_text,
    detail: row.detail,
    positionIds: row.position_ids,
    archived: row.archived,
    revision: row.revision,
  };
}

// Returns a team's complete catalog, including archived items for management.
// Consumers offering new choices filter archived items from this result.
async function readGameModelCatalog(scope, options = {}) {
  if (!isScoped(scope, "read")) return failure(403, "Active staff membership for this team is required.");
  const { defaultGameModelItems } = await import("../../src/modules/game-model/catalog.mjs");
  const items = new Map(defaultGameModelItems.map((item) => [item.id, item]));
  const query = scopedQuery(scope);
  query.set("order", "id.asc");
  query.set("limit", String(pageSize));
  while (true) {
    const result = await databaseRequest(query, options);
    if (!result.ok) return result;
    for (const row of result.rows) items.set(row.id, itemFromRow(row));
    if (result.rows.length < pageSize) break;
    query.set("id", `gt.${result.rows.at(-1).id}`);
  }
  return { ok: true, items: [...items.values()] };
}

function validText(value, limit) {
  return typeof value === "string" && !value.includes("\0") && Array.from(value.trim()).length <= limit;
}

async function normalizeItem(value) {
  const { defaultGameModelItems, gameModelSubPhases, gameModelPositions } = await import("../../src/modules/game-model/catalog.mjs");
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, kind, subPhaseId, title, when = "", detail = "", positionIds = [], archived, revision } = value;
  const seed = defaultGameModelItems.find((item) => item.id === id);
  const customId = normalizeGameModelUuid(id);
  if ((!seed && (!customId || customId !== id)) || !itemKinds.has(kind)
    || !gameModelSubPhases.some((subPhase) => subPhase.id === subPhaseId)
    || (seed && (seed.kind !== kind || seed.subPhaseId !== subPhaseId))) return null;
  if (!validText(title, 180) || !title.trim() || !validText(when, 400) || !validText(detail, 1200)) return null;
  if (typeof archived !== "boolean" || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647) return null;
  if (!Array.isArray(positionIds) || positionIds.length > gameModelPositions.length || new Set(positionIds).size !== positionIds.length
    || positionIds.some((id) => !gameModelPositions.some((position) => position.id === id))) return null;
  if (kind === "individual-action" && (!positionIds.length || !when.trim() || !detail.trim())) return null;
  if (kind !== "individual-action" && positionIds.length) return null;
  return { id, kind, subPhaseId, title: title.trim(), when: when.trim(), detail: detail.trim(), positionIds, archived, revision };
}

async function saveGameModelItem(scope, value, options = {}) {
  if (!isScoped(scope, "write")) return failure(403, "You do not have permission to edit Game Model.");
  const item = await normalizeItem(value);
  if (!item) return failure(400, "Check the title, sub-phase and action fields before saving.");
  const query = scopedQuery(scope);
  const body = {
    title: item.title,
    when_text: item.when,
    detail: item.detail,
    position_ids: item.positionIds,
    archived: item.archived,
    revision: item.revision + 1,
    updated_by: scope.actor.id,
    updated_at: new Date().toISOString(),
  };
  let result;
  if (item.revision === 0) {
    result = await databaseRequest(new URLSearchParams({ select: columns }), {
      ...options,
      method: "POST",
      body: { ...body, organization_id: scope.organizationId, team_id: scope.teamId, id: item.id, kind: item.kind, sub_phase_id: item.subPhaseId },
    });
  } else {
    query.set("id", `eq.${item.id}`);
    query.set("kind", `eq.${item.kind}`);
    query.set("sub_phase_id", `eq.${item.subPhaseId}`);
    query.set("revision", `eq.${item.revision}`);
    result = await databaseRequest(query, { ...options, method: "PATCH", body });
  }
  if (!result.ok) return result;
  if (result.rows.length !== 1) return failure(409, "This Game Model item changed. Refresh it and try again.");
  return { ok: true, item: itemFromRow(result.rows[0]) };
}

module.exports = { readGameModelCatalog, saveGameModelItem };
