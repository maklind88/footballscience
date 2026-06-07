export function createGameSimulatorCanvasRenderer(deps = {}) {
  const {
    ballRadiusMeters,
    canvas,
    clamp,
    cloneVector,
    computeReachDistance,
    ctx,
    gameSimulatorSidebarRenderer,
    getActionOrigin,
    getActiveExampleOverlay,
    getBallOwner,
    getGoalDirectionSign,
    getMetersToPixels,
    getPlayerBallControlPoint,
    getPlayerFacingAngle,
    getPlayerMagnetLabel,
    getProjectedActionDuration,
    getRenderedPrimarySelectedPlayerId,
    hasBallAction,
    isPlayerRenderedSelected,
    lerp,
    normalize,
    pitch,
    playerRadiusMeters,
    syncBallSpeedControls,
    syncDefensiveAggressionControls,
    syncDefensiveAutopilotButton,
    syncDribbleSpeedControls,
    syncFirstTouchControls,
    syncFormationControls,
    syncOffensiveAutopilotButton,
    syncPhysicalProfileControls,
    syncSurfaceControls,
    syncTeamIdentityControls,
    syncWeatherControls,
    toCanvas,
    updatePitchFullscreenHudLayout,
    updateSequenceButtons,
    win,
    getState,
  } = deps;
  const state = new Proxy({}, {
    get(_target, property) {
      return getState?.()?.[property];
    },
    set(_target, property, value) {
      const currentState = getState?.();
      if (currentState) {
        currentState[property] = value;
      }
      return true;
    },
    has(_target, property) {
      return property in (getState?.() ?? {});
    },
    ownKeys() {
      return Reflect.ownKeys(getState?.() ?? {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const currentState = getState?.() ?? {};
      if (!Object.prototype.hasOwnProperty.call(currentState, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: currentState[property],
      };
    },
  });

  function drawOverlayArrow(arrow) {
  const start = toCanvas(arrow.from);
  const end = toCanvas(arrow.to);
  const direction = normalize(arrow.from, arrow.to);
  const arrowSize = 11;
  const left = {
  x: end.x - direction.x * arrowSize - direction.y * arrowSize * 0.55,
  y: end.y - direction.y * arrowSize + direction.x * arrowSize * 0.55,
  };
  const right = {
  x: end.x - direction.x * arrowSize + direction.y * arrowSize * 0.55,
  y: end.y - direction.y * arrowSize - direction.x * arrowSize * 0.55,
  };
  ctx.save();
  ctx.strokeStyle = arrow.color;
  ctx.fillStyle = arrow.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  if (arrow.label) {
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 14;
  ctx.font = "600 12px Georgia";
  const textWidth = ctx.measureText(arrow.label).width;
  ctx.fillStyle = "rgba(17, 24, 29, 0.72)";
  ctx.fillRect(labelX - textWidth / 2 - 8, labelY - 12, textWidth + 16, 22);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(arrow.label, labelX, labelY - 1);
  }
  ctx.restore();
  }
  function drawExampleOverlay() {
  const overlay = getActiveExampleOverlay();
  if (!overlay) {
  return;
  }
  overlay.arrows.forEach(drawOverlayArrow);
  ctx.save();
  ctx.font = "700 14px Georgia";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(overlay.title, 18, 18);
  ctx.restore();
  }
  function drawPitch() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f7a45";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const fieldInset = 10;
  const fieldLeft = fieldInset;
  const fieldTop = fieldInset;
  const fieldWidth = canvas.width - fieldInset * 2;
  const fieldHeight = canvas.height - fieldInset * 2;
  const scaleX = fieldWidth / pitch.length;
  const scaleY = fieldHeight / pitch.width;
  const meterScale = Math.min(scaleX, scaleY);
  const centerX = fieldLeft + fieldWidth / 2;
  const centerY = fieldTop + fieldHeight / 2;
  const penaltyAreaDepth = 16.5 * scaleX;
  const penaltyAreaHeight = 40.32 * scaleY;
  const sixYardDepth = 5.5 * scaleX;
  const sixYardHeight = 18.32 * scaleY;
  const goalWidth = 7.32 * scaleY;
  const goalDepth = Math.max(12, 2.5 * scaleX);
  const penaltySpotDistance = 11 * scaleX;
  const penaltyArcRadius = 9.15 * meterScale;
  const penaltyArcAngle = Math.acos(clamp((16.5 - 11) / 9.15, -1, 1));
  const goalTop = centerY - goalWidth / 2;
  const goalBottom = centerY + goalWidth / 2;
  const leftPenaltyTop = centerY - penaltyAreaHeight / 2;
  const sixYardTop = centerY - sixYardHeight / 2;
  const rightFieldX = fieldLeft + fieldWidth;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 3;
  ctx.strokeRect(fieldLeft, fieldTop, fieldWidth, fieldHeight);
  ctx.beginPath();
  ctx.moveTo(centerX, fieldTop);
  ctx.lineTo(centerX, fieldTop + fieldHeight);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 9.15 * meterScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(fieldLeft, leftPenaltyTop, penaltyAreaDepth, penaltyAreaHeight);
  ctx.strokeRect(rightFieldX - penaltyAreaDepth, leftPenaltyTop, penaltyAreaDepth, penaltyAreaHeight);
  ctx.strokeRect(fieldLeft, sixYardTop, sixYardDepth, sixYardHeight);
  ctx.strokeRect(rightFieldX - sixYardDepth, sixYardTop, sixYardDepth, sixYardHeight);
  const leftPenaltySpotX = fieldLeft + penaltySpotDistance;
  const rightPenaltySpotX = rightFieldX - penaltySpotDistance;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(leftPenaltySpotX, centerY, penaltyArcRadius, -penaltyArcAngle, penaltyArcAngle);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
  rightPenaltySpotX,
  centerY,
  penaltyArcRadius,
  Math.PI - penaltyArcAngle,
  Math.PI + penaltyArcAngle
  );
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(leftPenaltySpotX, centerY, 3.6, 0, Math.PI * 2);
  ctx.arc(rightPenaltySpotX, centerY, 3.6, 0, Math.PI * 2);
  ctx.fill();
  function drawGoal(side) {
  const direction = side === "left" ? -1 : 1;
  const frontX = side === "left" ? fieldLeft : rightFieldX;
  const backX = frontX + direction * goalDepth;
  const backTop = goalTop + goalDepth * 0.24;
  const backBottom = goalBottom - goalDepth * 0.24;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.strokeStyle = "rgba(255,255,255,0.98)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(frontX, goalTop);
  ctx.lineTo(backX, backTop);
  ctx.lineTo(backX, backBottom);
  ctx.lineTo(frontX, goalBottom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(frontX, goalTop);
  ctx.lineTo(frontX, goalBottom);
  ctx.moveTo(backX, backTop);
  ctx.lineTo(backX, backBottom);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 0.9;
  for (let row = 1; row <= 4; row += 1) {
  const ratio = row / 5;
  const yFront = lerp(goalTop, goalBottom, ratio);
  const yBack = lerp(backTop, backBottom, ratio);
  ctx.beginPath();
  ctx.moveTo(frontX, yFront);
  ctx.lineTo(backX, yBack);
  ctx.stroke();
  }
  for (let column = 1; column <= 4; column += 1) {
  const ratio = column / 5;
  const x = lerp(frontX, backX, ratio);
  const topY = lerp(goalTop, backTop, ratio);
  const bottomY = lerp(goalBottom, backBottom, ratio);
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, bottomY);
  ctx.stroke();
  }
  ctx.restore();
  }
  drawGoal("left");
  drawGoal("right");
  }
  function getPlaybackStep() {
  if (!state.sequence.isPlaying || state.sequence.playbackIndex < 0) {
  return null;
  }
  return state.sequence.steps[state.sequence.playbackIndex] ?? null;
  }
  function shouldShowActionPlanningOverlay() {
  const playbackStep = getPlaybackStep();
  return !(
  state.autoPilotPlay?.active ||
  state.draftStep?.autoGenerated ||
  playbackStep?.autoGenerated
  );
  }
  function drawBallTarget() {
  if (!hasBallAction() || !shouldShowActionPlanningOverlay()) {
  return;
  }
  const target = toCanvas(state.ball.target);
  const current = toCanvas(state.ball.position);
  const isDribble = state.ball.actionType === "dribble";
  const isShot = state.ball.actionType === "shot";
  ctx.save();
  ctx.strokeStyle = isDribble
  ? "rgba(129, 184, 255, 0.7)"
  : isShot
  ? "rgba(255, 128, 128, 0.72)"
  : "rgba(255, 245, 214, 0.6)";
  ctx.lineWidth = 2;
  ctx.setLineDash(isDribble ? [12, 8] : isShot ? [4, 6] : [8, 8]);
  ctx.beginPath();
  ctx.moveTo(current.x, current.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 191, 105, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(target.x - 10, target.y);
  ctx.lineTo(target.x + 10, target.y);
  ctx.moveTo(target.x, target.y - 10);
  ctx.lineTo(target.x, target.y + 10);
  ctx.stroke();
  ctx.restore();
  }
  function drawReachZones() {
  if (!hasBallAction() || !shouldShowActionPlanningOverlay()) {
  return;
  }
  const currentDuration = state.ball.elapsedTravelTime;
  const projectedDuration = getProjectedActionDuration();
  const metersToPixels = getMetersToPixels();
  state.players.forEach((player) => {
  const currentReach = computeReachDistance(player, currentDuration);
  const projectedReach = computeReachDistance(player, projectedDuration);
  if (projectedReach <= 0.02) {
  return;
  }
  const point = toCanvas(getActionOrigin(player));
  const selected = isPlayerRenderedSelected(player.id);
  ctx.save();
  if (currentReach > 0.02) {
  ctx.beginPath();
  ctx.fillStyle =
  player.team === "home"
  ? selected
  ? "rgba(129, 184, 255, 0.16)"
  : "rgba(129, 184, 255, 0.08)"
  : selected
  ? "rgba(255, 155, 155, 0.16)"
  : "rgba(255, 155, 155, 0.08)";
  ctx.arc(point.x, point.y, currentReach * metersToPixels, 0, Math.PI * 2);
  ctx.fill();
  }
  ctx.beginPath();
  ctx.strokeStyle = selected ? player.accent : "rgba(255,255,255,0.22)";
  ctx.lineWidth = selected ? 2.4 : 1.3;
  ctx.setLineDash(selected ? [8, 6] : [5, 9]);
  ctx.arc(point.x, point.y, projectedReach * metersToPixels, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  });
  }
  function drawPlayer(player) {
  const point = toCanvas(player.position);
  const radius = playerRadiusMeters * getMetersToPixels();
  const selected = isPlayerRenderedSelected(player.id);
  const isPrimarySelected = player.id === getRenderedPrimarySelectedPlayerId();
  const selectionStroke = isPrimarySelected
  ? "#ffd76b"
  : selected
  ? "#f6e6a0"
  : "rgba(255,255,255,0.92)";
  const selectionLineWidth = isPrimarySelected ? 3.4 : selected ? 2.7 : 2;
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = player.color;
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = selectionLineWidth;
  ctx.strokeStyle = selectionStroke;
  ctx.stroke();
  const facingAngle = getPlayerFacingAngle(player);
  const footCenterOffset = radius * 0.97;
  const footSideOffset = radius * 0.68;
  const footLength = radius * 0.29;
  const footWidth = radius * 0.18;
  const footAngle = Math.PI / 6;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(facingAngle);
  ctx.fillStyle = "rgba(255,255,255,0.99)";
  ctx.strokeStyle = "rgba(110, 110, 110, 0.22)";
  ctx.lineWidth = Math.max(0.9, radius * 0.08);
  [-1, 1].forEach((side) => {
  const footCenterX = footCenterOffset;
  const footCenterY = side * footSideOffset;
  ctx.beginPath();
  ctx.ellipse(
  footCenterX,
  footCenterY,
  footLength,
  footWidth,
  side * footAngle,
  0,
  Math.PI * 2
  );
  ctx.fill();
  ctx.stroke();
  });
  ctx.restore();
  const magnetLabel = getPlayerMagnetLabel(player);
  const fontSize = magnetLabel.length <= 3 ? 13 : magnetLabel.length <= 5 ? 11 : 9;
  ctx.fillStyle = "white";
  ctx.font = `bold ${fontSize}px Georgia`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(magnetLabel, point.x, point.y, radius * 1.55);
  ctx.restore();
  }
  function drawBall() {
  const groundPoint = toCanvas(state.ball.position);
  const radius = ballRadiusMeters * getMetersToPixels();
  const heightPixels = Math.max(0, state.ball.height * getMetersToPixels() * 0.42);
  const point = {
  x: groundPoint.x,
  y: groundPoint.y - heightPixels,
  };
  ctx.save();
  if (heightPixels > 0.5) {
  ctx.beginPath();
  ctx.fillStyle = `rgba(15, 16, 18, ${clamp(0.22 + heightPixels / 48, 0.22, 0.4)})`;
  ctx.ellipse(
  groundPoint.x,
  groundPoint.y + radius * 0.12,
  radius * (1 + heightPixels * 0.016),
  radius * 0.58,
  0,
  0,
  Math.PI * 2
  );
  ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = "#fbfbf7";
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#2d2d2d";
  ctx.stroke();
  const panelRadius = radius * 0.28;
  const seamRadius = radius * 0.58;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(state.ball.spinAngle || 0);
  ctx.fillStyle = "#232323";
  ctx.beginPath();
  for (let index = 0; index < 5; index += 1) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
  const x = Math.cos(angle) * panelRadius;
  const y = Math.sin(angle) * panelRadius;
  if (index === 0) {
  ctx.moveTo(x, y);
  } else {
  ctx.lineTo(x, y);
  }
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(35,35,35,0.92)";
  ctx.lineWidth = 0.85;
  for (let index = 0; index < 5; index += 1) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
  ctx.beginPath();
  ctx.moveTo(
  Math.cos(angle) * panelRadius * 0.82,
  Math.sin(angle) * panelRadius * 0.82
  );
  ctx.lineTo(
  Math.cos(angle) * seamRadius,
  Math.sin(angle) * seamRadius
  );
  ctx.stroke();
  }
  ctx.fillStyle = "rgba(35,35,35,0.9)";
  [-0.9, 0.8].forEach((angleOffset) => {
  ctx.beginPath();
  ctx.arc(
  Math.cos(angleOffset) * radius * 0.48,
  Math.sin(angleOffset) * radius * 0.36,
  radius * 0.11,
  0,
  Math.PI * 2
  );
  ctx.fill();
  });
  ctx.restore();
  ctx.restore();
  }
  function drawGoalFlash() {
  const flash = state.goalFlash;
  if (!flash) {
  return;
  }
  const now = Date.now();
  if (now > flash.expiresAtMs) {
  state.goalFlash = null;
  return;
  }
  const progress = clamp((now - flash.createdAtMs) / Math.max(flash.expiresAtMs - flash.createdAtMs, 1), 0, 1);
  const alpha = progress < 0.18 ? progress / 0.18 : 1 - clamp((progress - 0.72) / 0.28, 0, 1);
  const point = toCanvas(flash.displayPoint ?? flash.point);
  const linePoint = toCanvas(flash.point ?? flash.displayPoint);
  const goalSign = getGoalDirectionSign(flash.side);
  const ballRadius = ballRadiusMeters * getMetersToPixels() * 1.15;
  const burstRadius = lerp(12, 46, progress);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(255, 245, 214, 0.78)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(linePoint.x - goalSign * 28, linePoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 215, 107, 0.72)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, burstRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 245, 214, 0.96)";
  ctx.arc(point.x, point.y, ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(25, 24, 22, 0.82)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const bannerText = `GOAL • ${flash.scoringTeamName ?? "Team"}`;
  ctx.font = "800 28px Georgia";
  const textWidth = ctx.measureText(bannerText).width;
  const bannerX = canvas.width / 2;
  const bannerY = 42;
  ctx.fillStyle = "rgba(15, 16, 18, 0.76)";
  ctx.strokeStyle = "rgba(255, 245, 214, 0.7)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(bannerX - textWidth / 2 - 24, bannerY - 22, textWidth + 48, 44, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 245, 214, 0.98)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bannerText, bannerX, bannerY);
  ctx.restore();
  }
  function drawSelectionBox() {
  if (state.drag?.type !== "selection" || !state.drag.moved) {
  return;
  }
  const start = toCanvas(state.drag.startPoint);
  const end = toCanvas(state.drag.currentPoint);
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left, top, width, height);
  ctx.restore();
  }
  function getRenderedAutoV2ActionMeta() {
  if (state.draftStep) {
  return state.draftStep;
  }
  if (state.sequence.isPlaying && state.sequence.playbackIndex >= 0) {
  return state.sequence.steps[state.sequence.playbackIndex] ?? null;
  }
  return null;
  }
  function getAutoV2DebugTriggerRows(triggers = null) {
  if (!triggers) {
  return [];
  }
  const rows = [
  ["Press", triggers.ballPressure],
  ["Fwd", triggers.forwardFacing],
  ["High line", triggers.highBackLine],
  ["Central", triggers.centralClosed],
  ["Rec press", triggers.receiverPressure],
  ["Rest", triggers.restDefenseBalance],
  ["Loose", triggers.poorTouchLooseBall],
  ].filter(([, value]) => Number.isFinite(value));
  return rows.map(([label, value]) => `${label} ${Math.round(clamp(value, 0, 1) * 100)}`);
  }
  function drawAutoV2DebugLabel(player, intent, tone = "attack") {
  if (!intent) {
  return;
  }
  const point = toCanvas(player.position);
  const primary = intent.label ?? intent.type ?? "Auto v2";
  const secondary = intent.relationship ? intent.relationship.split(" / ")[0] : "";
  const text = secondary ? `${primary} • ${secondary}` : primary;
  ctx.save();
  ctx.font = "700 10px -apple-system, BlinkMacSystemFont, sans-serif";
  const maxWidth = 168;
  const displayText = text.length > 42 ? `${text.slice(0, 39)}...` : text;
  const textWidth = Math.min(ctx.measureText(displayText).width, maxWidth);
  const x = clamp(point.x - textWidth / 2 - 7, 8, canvas.width - textWidth - 14);
  const y = clamp(point.y - 31, 8, canvas.height - 24);
  ctx.fillStyle = tone === "defence" ? "rgba(121, 33, 33, 0.78)" : "rgba(10, 38, 82, 0.78)";
  ctx.strokeStyle = tone === "defence" ? "rgba(255, 180, 180, 0.72)" : "rgba(173, 212, 255, 0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, textWidth + 14, 20, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(displayText, x + 7, y + 10, maxWidth);
  ctx.restore();
  }
  function drawAutoV2DebugPanel(actionMeta) {
  const offensive = actionMeta?.offensiveAutopilot;
  const defensive = actionMeta?.defensiveAutopilot;
  const triggerRows = getAutoV2DebugTriggerRows(offensive?.triggers);
  const activeLabels = [
  ...(offensive?.triggers?.labels ?? []),
  offensive?.principleLabel,
  defensive?.phaseLabel ? `Def ${defensive.phaseLabel}` : null,
  ].filter(Boolean).slice(0, 5);
  const rows = [
  "Auto v2 Debug",
  ...triggerRows.slice(0, 7),
  ...activeLabels.map((label) => label.length > 34 ? `${label.slice(0, 31)}...` : label),
  ];
  if (!rows.length) {
  return;
  }
  ctx.save();
  ctx.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
  const width = Math.min(
  260,
  Math.max(...rows.map((row) => ctx.measureText(row).width)) + 24
  );
  const height = rows.length * 18 + 16;
  const x = canvas.width - width - 14;
  const y = 14;
  ctx.fillStyle = "rgba(9, 13, 22, 0.76)";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.fill();
  ctx.stroke();
  rows.forEach((row, index) => {
  ctx.fillStyle = index === 0 ? "rgba(255,255,255,0.98)" : "rgba(226,238,255,0.9)";
  ctx.font = index === 0
  ? "800 12px -apple-system, BlinkMacSystemFont, sans-serif"
  : "700 10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(row, x + 12, y + 16 + index * 18);
  });
  ctx.restore();
  }
  function drawAutoV2DebugOverlay() {
  if (!state.autoV2Debug && !win.__autoV2DebugEnabled) {
  return;
  }
  const actionMeta = getRenderedAutoV2ActionMeta();
  if (!actionMeta?.offensiveAutopilot && !actionMeta?.defensiveAutopilot) {
  return;
  }
  const offensiveIntents = actionMeta.offensiveAutopilot?.intents ?? {};
  const defensiveIntents = actionMeta.defensiveAutopilot?.intents ?? {};
  state.players.forEach((player) => {
  if (offensiveIntents[player.id]) {
  drawAutoV2DebugLabel(player, offensiveIntents[player.id], "attack");
  }
  if (defensiveIntents[player.id]) {
  drawAutoV2DebugLabel(player, defensiveIntents[player.id], "defence");
  }
  });
  drawAutoV2DebugPanel(actionMeta);
  }
  function syncOwnedBallPosition() {
  if (!state.ball.ownerPlayerId || state.ball.inTransit || hasBallAction()) {
  return;
  }
  const owner = getBallOwner();
  if (!owner) {
  return;
  }
  const controlPoint = getPlayerBallControlPoint(owner);
  state.ball.position = cloneVector(controlPoint);
  state.ball.startPosition = cloneVector(controlPoint);
  state.ball.target = cloneVector(controlPoint);
  state.ball.height = 0;
  }
  function renderSidebar() {
  gameSimulatorSidebarRenderer.renderSidebar();
  }
  function render() {
  syncFormationControls();
  syncTeamIdentityControls();
  syncPhysicalProfileControls();
  syncSurfaceControls();
  syncWeatherControls();
  syncFirstTouchControls();
  syncDefensiveAggressionControls();
  syncBallSpeedControls();
  syncDribbleSpeedControls();
  syncDefensiveAutopilotButton();
  syncOffensiveAutopilotButton();
  updateSequenceButtons();
  syncOwnedBallPosition();
  drawPitch();
  drawBallTarget();
  drawReachZones();
  drawExampleOverlay();
  state.players.forEach(drawPlayer);
  drawBall();
  drawAutoV2DebugOverlay();
  drawGoalFlash();
  drawSelectionBox();
  renderSidebar();
  updatePitchFullscreenHudLayout();
  }

  return {
    drawPitch,
    render,
    syncOwnedBallPosition,
  };
}
