async function gameModelActionMetadata(payload, currentMetadata = {}) {
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

  const { resolveGameModelAction } = await import("../../src/modules/idp/game-model/action-selection.mjs");
  const action = resolveGameModelAction(actionId, positionId);
  if (!action) return { ok: false, status: 400, reason: "Choose a valid Game Model action and position." };
  if (metadata.game_model_action?.actionId === actionId && metadata.game_model_action?.positionId === positionId) return { ok: true };
  metadata.game_model_action = action;
  return { ok: true, metadata };
}

module.exports = { gameModelActionMetadata };
