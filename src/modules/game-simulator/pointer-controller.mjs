export function createGameSimulatorPointerController(deps = {}) {
  const {
    canvas,
    getState,
    playerRadiusMeters,
    ballRadiusMeters,
    pitch,
    distance,
    clamp,
    cloneVector,
    normalizeSelectedPlayerIds,
    hasBallAction,
    getPlayerById,
    getPlayerBallControlPoint,
    refreshPlannedBallActionProfile,
    getPointerRequestedActionMode,
    issuePassCommand,
    issueBallCommand,
    consumePointerActionMode,
    clearBallAction,
    logEvent,
    isSelectionModifierActive,
    toggleSelectedPlayer,
    isPlayerSelected,
    setSingleSelectedPlayer,
    setSelectedPlayers,
    getSelectedPlayerIds,
    getActionOrigin,
    getEditableRadius,
    eventToPitch,
    clampToPitch,
    subtract,
    clampToCircle,
    rotatePlayerBodyAlongMovement,
    clearSecurePossession,
    markSimulatorDirty,
    clearSelectedPlayers,
    render,
  } = deps;

  function pickPlayer(point) {
    const state = getState();
    const hitRadius = playerRadiusMeters + 0.5;
    const reversed = [...state.players].reverse();
    return reversed.find((player) => distance(player.position, point) <= hitRadius) ?? null;
  }

  function isBallHit(point) {
    const state = getState();
    return distance(state.ball.position, point) <= ballRadiusMeters + 0.55;
  }

  function clampGroupDragDelta(initialPositions, delta) {
    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;
    Object.values(initialPositions).forEach((position) => {
      minDx = Math.max(minDx, pitch.inset - position.x);
      maxDx = Math.min(maxDx, pitch.length - pitch.inset - position.x);
      minDy = Math.max(minDy, pitch.inset - position.y);
      maxDy = Math.min(maxDy, pitch.width - pitch.inset - position.y);
    });
    return {
      x: clamp(delta.x, minDx, maxDx),
      y: clamp(delta.y, minDy, maxDy),
    };
  }

  function hasSelectionDragMoved(drag, point) {
    return distance(drag.startPoint, point) > 0.35;
  }

  function getSelectionRect(startPoint, endPoint) {
    return {
      left: Math.min(startPoint.x, endPoint.x),
      right: Math.max(startPoint.x, endPoint.x),
      top: Math.min(startPoint.y, endPoint.y),
      bottom: Math.max(startPoint.y, endPoint.y),
    };
  }

  function getPlayersInsideSelectionRect(rect) {
    const state = getState();
    const selectionPadding = playerRadiusMeters * 0.4;
    return state.players
      .filter(
        (player) =>
          player.position.x >= rect.left - selectionPadding &&
          player.position.x <= rect.right + selectionPadding &&
          player.position.y >= rect.top - selectionPadding &&
          player.position.y <= rect.bottom + selectionPadding
      )
      .map((player) => player.id);
  }

  function updateSelectionDragPreview(drag, point) {
    const state = getState();
    drag.currentPoint = cloneVector(point);
    drag.moved = drag.moved || hasSelectionDragMoved(drag, point);
    if (!drag.moved) {
      drag.previewSelectedPlayerIds = [...drag.baseSelectedPlayerIds];
      drag.previewPrimaryPlayerId = drag.basePrimaryPlayerId;
      return;
    }
    const rect = getSelectionRect(drag.startPoint, point);
    const hitPlayerIds = getPlayersInsideSelectionRect(rect);
    const previewSelectedPlayerIds = drag.append
      ? normalizeSelectedPlayerIds(
          [...drag.baseSelectedPlayerIds, ...hitPlayerIds],
          drag.basePrimaryPlayerId ?? hitPlayerIds[0] ?? state.selectedPlayerId
        )
      : hitPlayerIds;
    const previewPrimaryPlayerId = previewSelectedPlayerIds.includes(drag.basePrimaryPlayerId)
      ? drag.basePrimaryPlayerId
      : previewSelectedPlayerIds[0] ?? drag.basePrimaryPlayerId ?? state.selectedPlayerId;
    drag.previewSelectedPlayerIds = previewSelectedPlayerIds;
    drag.previewPrimaryPlayerId = previewPrimaryPlayerId;
  }

  function syncBallToManualPlayerMove(playerIds) {
    const state = getState();
    const movedPlayerIds = new Set(playerIds);
    if (!hasBallAction() && state.ball.ownerPlayerId && movedPlayerIds.has(state.ball.ownerPlayerId)) {
      const owner = getPlayerById(state.ball.ownerPlayerId);
      if (owner) {
        const controlPoint = getPlayerBallControlPoint(owner);
        state.ball.position = cloneVector(controlPoint);
        state.ball.startPosition = cloneVector(controlPoint);
        state.ball.target = cloneVector(controlPoint);
      }
    }
    if (state.ball.actionType === "dribble" && state.ball.carrierPlayerId && movedPlayerIds.has(state.ball.carrierPlayerId) && !state.isRunning) {
      const carrier = getPlayerById(state.ball.carrierPlayerId);
      if (carrier) {
        state.ball.position = cloneVector(getPlayerBallControlPoint(carrier));
      }
    }
    if (state.ball.actionType === "pass" && state.ball.receiverPlayerId && movedPlayerIds.has(state.ball.receiverPlayerId) && !state.isRunning) {
      const receiver = getPlayerById(state.ball.receiverPlayerId);
      if (receiver) {
        state.ball.target = cloneVector(getPlayerBallControlPoint(receiver));
        if (state.draftStep?.actionType === "pass") {
          state.draftStep.target = cloneVector(getPlayerBallControlPoint(receiver));
          refreshPlannedBallActionProfile();
        }
      }
    }
  }

  function handlePointerDown(event) {
    const state = getState();
    const point = clampToPitch(eventToPitch(event));
    if (state.isRunning || state.sequence.isPlaying) {
      const player = pickPlayer(point);
      if (player) {
        setSingleSelectedPlayer(player.id);
        render();
      }
      return;
    }
    const activeActionMode = getPointerRequestedActionMode();
    const hasPlannedBallAction = hasBallAction() || state.draftStep;
    if (activeActionMode && !hasPlannedBallAction && !isBallHit(point)) {
      const player = pickPlayer(point);
      if (activeActionMode === "pass" && player) {
        issuePassCommand(player.position, player.id);
      } else {
        issueBallCommand(player ? player.position : point, activeActionMode);
      }
      consumePointerActionMode(activeActionMode);
      render();
      return;
    }
    if (isBallHit(point)) {
      if (hasBallAction() || state.draftStep) {
        clearBallAction();
        logEvent("Ball action cleared. Players can move freely again.");
      }
      state.drag = {
        type: "ball",
        pointerId: event.pointerId,
        startPosition: cloneVector(point),
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const player = pickPlayer(point);
    if (player) {
      if (!hasBallAction() && isSelectionModifierActive(event)) {
        toggleSelectedPlayer(player.id);
        render();
        return;
      }
      if (!isPlayerSelected(player.id) || hasBallAction()) {
        setSingleSelectedPlayer(player.id);
      } else {
        setSelectedPlayers(getSelectedPlayerIds(), player.id);
      }
      const dragPlayerIds = !hasBallAction() ? getSelectedPlayerIds() : [player.id];
      state.drag = {
        type: "player",
        pointerId: event.pointerId,
        playerId: player.id,
        playerIds: dragPlayerIds,
        pointerStart: cloneVector(point),
        actionOrigin: hasBallAction() ? cloneVector(getActionOrigin(player)) : null,
        editableRadius: hasBallAction() ? getEditableRadius(player) : null,
        initialPositions: Object.fromEntries(
          dragPlayerIds.map((playerId) => [playerId, cloneVector(getPlayerById(playerId).position)])
        ),
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }
    if (!hasBallAction()) {
      state.drag = {
        type: "selection",
        pointerId: event.pointerId,
        startPoint: cloneVector(point),
        currentPoint: cloneVector(point),
        append: isSelectionModifierActive(event),
        baseSelectedPlayerIds: getSelectedPlayerIds(),
        basePrimaryPlayerId: state.selectedPlayerId,
        previewSelectedPlayerIds: getSelectedPlayerIds(),
        previewPrimaryPlayerId: state.selectedPlayerId,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event) {
    const state = getState();
    if (!state.drag || state.isRunning || state.sequence.isPlaying) {
      return;
    }
    const point = clampToPitch(eventToPitch(event));
    if (state.drag.type === "player") {
      const dragPlayerIds = state.drag.playerIds?.filter((playerId) => getPlayerById(playerId)) ?? [];
      if (!dragPlayerIds.length) {
        return;
      }
      if (!hasBallAction() && dragPlayerIds.length > 1) {
        const delta = subtract(point, state.drag.pointerStart);
        const clampedDelta = clampGroupDragDelta(state.drag.initialPositions, delta);
        dragPlayerIds.forEach((playerId) => {
          const player = getPlayerById(playerId);
          const startPosition = state.drag.initialPositions[playerId];
          if (!player || !startPosition) {
            return;
          }
          player.position = {
            x: startPosition.x + clampedDelta.x,
            y: startPosition.y + clampedDelta.y,
          };
        });
        state.drag.moved = Math.abs(clampedDelta.x) > 0.001 || Math.abs(clampedDelta.y) > 0.001;
        syncBallToManualPlayerMove(dragPlayerIds);
        render();
        return;
      }
      const player = getPlayerById(state.drag.playerId);
      if (!player) {
        return;
      }
      const previousPosition = cloneVector(player.position);
      if (hasBallAction()) {
        player.position = clampToCircle(point, state.drag.actionOrigin ?? getActionOrigin(player), state.drag.editableRadius ?? getEditableRadius(player));
      } else {
        player.position = point;
      }
      if (hasBallAction()) {
        rotatePlayerBodyAlongMovement(player, previousPosition, player.position, 0.95);
      }
      state.drag.moved = state.drag.moved || distance(state.drag.initialPositions[player.id], player.position) > 0.001;
      syncBallToManualPlayerMove([player.id]);
      setSelectedPlayers(getSelectedPlayerIds(), player.id);
      render();
      return;
    }
    if (state.drag.type === "ball") {
      clearBallAction();
      clearSecurePossession();
      state.ball.ownerPlayerId = null;
      state.ball.position = point;
      state.ball.startPosition = point;
      state.ball.target = point;
      state.drag.moved = state.drag.moved || distance(state.drag.startPosition, state.ball.position) > 0.001;
      render();
    }
    if (state.drag.type === "selection") {
      updateSelectionDragPreview(state.drag, point);
      render();
    }
  }

  function handlePointerUp(event) {
    const state = getState();
    if (!state.drag) {
      return;
    }
    if (state.drag.type === "player" && state.drag.moved) {
      markSimulatorDirty();
      const movedPlayerCount = state.drag.playerIds?.length ?? 1;
      const player = getPlayerById(state.drag.playerId);
      if (movedPlayerCount > 1 && !hasBallAction()) {
        logEvent(`${movedPlayerCount} players moved manually.`);
      } else if (player) {
        logEvent(`${player.shortLabel} ${player.role} moved manually.`);
      }
    }
    if (state.drag.type === "ball" && state.drag.moved) {
      markSimulatorDirty();
      logEvent("Ball moved manually.");
    }
    if (state.drag.type === "selection" && state.drag.moved) {
      const previewSelectedPlayerIds = state.drag.previewSelectedPlayerIds ?? [];
      const selectionChanged =
        previewSelectedPlayerIds.length !== state.drag.baseSelectedPlayerIds.length ||
        previewSelectedPlayerIds.some((playerId, index) => playerId !== state.drag.baseSelectedPlayerIds[index]);
      if (previewSelectedPlayerIds.length && selectionChanged) {
        setSelectedPlayers(previewSelectedPlayerIds, state.drag.previewPrimaryPlayerId);
        logEvent(previewSelectedPlayerIds.length === 1 ? "1 player selected." : `${previewSelectedPlayerIds.length} players selected.`);
      }
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.drag = null;
    render();
  }

  function handlePointerCancel(event) {
    const state = getState();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.drag = null;
  }

  function handleCanvasDoubleClick() {
    const state = getState();
    if (state.isRunning || state.sequence.isPlaying) {
      return;
    }
    if (!getSelectedPlayerIds().length && !state.selectedPlayerId) {
      return;
    }
    clearSelectedPlayers();
    logEvent("All players deselected.");
    render();
  }

  return {
    pickPlayer,
    isBallHit,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleCanvasDoubleClick,
  };
}
