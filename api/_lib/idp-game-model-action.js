const { actorScope, selectRows } = require("./idp-database-core.js");
const { resolveGameModelScope } = require("./game-model-scope.js");
const { readGameModelCatalog } = require("./game-model-catalog.js");

async function matchesIdpTeam(scope, actor) {
  const idpTeam = actorScope(actor);
  if (idpTeam.teamId === scope.teamId && idpTeam.organizationId === scope.organizationId) return true;

  // IDP still uses legacy aliases. Identify the same organization and team
  // using only metadata on the canonical, membership-checked Platform rows.
  const [teamResult, organizationResult] = await Promise.all([
    selectRows("platform_teams", new URLSearchParams({
      select: "metadata",
      id: `eq.${scope.teamId}`,
      organization_id: `eq.${scope.organizationId}`,
      status: "eq.active",
      limit: "1",
    })),
    selectRows("platform_organizations", new URLSearchParams({
      select: "metadata",
      id: `eq.${scope.organizationId}`,
      status: "eq.active",
      limit: "1",
    })),
  ]);
  if (!teamResult.ok || !organizationResult.ok) return false;
  const legacyTeamId = teamResult.payload[0]?.metadata?.legacyTeamId;
  if (!legacyTeamId || actorScope({ teamId: legacyTeamId }).teamId !== idpTeam.teamId) return false;
  if (scope.organizationId === idpTeam.organizationId) return true;

  const legacyOrganization = organizationResult.payload[0]?.metadata?.legacyOrganization;
  // The canonical NCC identity repair recorded this organization marker.
  const legacyOrganizationId = legacyOrganization === "football-science-live" && legacyTeamId === "team-north-carolina-courage"
    ? "club-ncc"
    : legacyOrganization;
  return Boolean(legacyOrganizationId
    && actorScope({ organizationId: legacyOrganizationId }).organizationId === idpTeam.organizationId);
}

async function resolveCatalogAction(payload, actor) {
  const { gameModelTeamId, gameModelActionId, gameModelPositionId, gameModelItemRevision } = payload;
  const scope = await resolveGameModelScope(actor, gameModelTeamId);
  if (!scope.ok) return scope;
  if (!await matchesIdpTeam(scope, actor)) {
    return { ok: false, status: 403, reason: "Choose a Game Model action from the player's team." };
  }
  const catalogue = await readGameModelCatalog(scope);
  if (!catalogue.ok) return catalogue;
  const { gameModelActionForFocus } = await import("../../src/modules/game-model/catalog.mjs");
  const action = gameModelActionForFocus(catalogue.items, gameModelActionId, gameModelPositionId);
  const item = catalogue.items.find(({ id }) => id === gameModelActionId);
  if (!action || String(gameModelItemRevision) !== String(item.revision)) {
    return { ok: false, status: 409, reason: "This Game Model action changed. Reopen IDP and choose it again." };
  }
  return { ok: true, action };
}

async function gameModelActionMetadata(payload, currentMetadata = {}, actor = null) {
  const hasAction = Object.hasOwn(payload, "gameModelActionId");
  const hasPosition = Object.hasOwn(payload, "gameModelPositionId");
  if (!hasAction && !hasPosition) return { ok: true };

  const actionId = payload.gameModelActionId;
  const positionId = payload.gameModelPositionId;
  if (typeof actionId !== "string" || typeof positionId !== "string" || actionId.length > 180 || positionId.length > 20) {
    return { ok: false, status: 400, reason: "Choose a valid Game Model action and position." };
  }
  if (!currentMetadata || typeof currentMetadata !== "object" || Array.isArray(currentMetadata)) {
    return { ok: false, status: 409, reason: "This focus has incompatible saved details. The Game Model action could not be changed." };
  }
  const metadata = { ...currentMetadata };
  if (!actionId && !positionId) {
    if (Object.hasOwn(metadata, "game_model_action")) {
      delete metadata.game_model_action;
      return { ok: true, metadata };
    }
    return { ok: true };
  }

  if (Object.hasOwn(payload, "gameModelTeamId")) {
    if (typeof payload.gameModelTeamId !== "string" || !payload.gameModelTeamId) {
      return { ok: false, status: 400, reason: "Choose a Game Model action from the player's team." };
    }
    const result = await resolveCatalogAction(payload, actor);
    if (!result.ok) return result;
    const existing = metadata.game_model_action;
    if (existing && Object.entries(result.action).every(([key, value]) => existing[key] === value)) return { ok: true };
    metadata.game_model_action = result.action;
    return { ok: true, metadata };
  }

  // The static integration remains available to older IDP clients without a
  // catalogue context. Preserve the snapshot when they reselect the same pair.
  const { resolveGameModelAction } = await import("../../src/modules/idp/game-model/action-selection.mjs");
  const action = resolveGameModelAction(actionId, positionId);
  if (!action) return { ok: false, status: 400, reason: "Choose a valid Game Model action and position." };
  if (metadata.game_model_action?.actionId === actionId && metadata.game_model_action?.positionId === positionId) return { ok: true };
  metadata.game_model_action = action;
  return { ok: true, metadata };
}

module.exports = { gameModelActionMetadata };
