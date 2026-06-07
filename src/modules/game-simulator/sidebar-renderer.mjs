export function createGameSimulatorSidebarRenderer(deps = {}) {
  const {
    ui,
    getState,
    teams,
    getSelectedPlayer,
    getBallOwner,
    getProjectedActionDuration,
    formatMeters,
    getActionDistance,
    computeReachDistance,
    getCurrentActionDuration,
    getPlayerBallControlPoint,
    distance,
    getActionOrigin,
    getEditableRadius,
    getPlayerRoleModel,
    getCompetitionPhysicalLabel,
    renderSelectedMetric,
    renderSelectedProfileControl,
    hasBallAction,
    formatTime,
    getRemainingBallTravelTime,
    getBallProfileLabel,
    getDisplayedBallSpeed,
    formatSpeed,
    getBallStatus,
    getActionTypeLabel,
    isPlayerRenderedSelected,
    describeStep,
    createStepThumbnail,
  } = deps;

  function renderSidebar() {
    const state = getState?.();
    if (!state || !ui) {
      return;
    }

    const selectedPlayer = getSelectedPlayer();
    const ballOwner = getBallOwner();
    const projectedDuration = getProjectedActionDuration();
    const actionDistanceText = formatMeters(getActionDistance());
    const currentReach = selectedPlayer ? computeReachDistance(selectedPlayer, getCurrentActionDuration()) : null;
    const selectedPlayerControlPoint = selectedPlayer ? getPlayerBallControlPoint(selectedPlayer) : null;
    const distanceToBall = selectedPlayerControlPoint ? distance(selectedPlayerControlPoint, state.ball.position) : null;
    const actionOrigin = selectedPlayer ? getActionOrigin(selectedPlayer) : null;
    const movedDistance = selectedPlayer && actionOrigin ? distance(actionOrigin, selectedPlayer.position) : null;
    const editableRadius = selectedPlayer ? getEditableRadius(selectedPlayer) : null;
    const selectedPlayerIntelligence = selectedPlayer
      ? Math.round(selectedPlayer.intelligenceProfile?.intelligence ?? 0)
      : null;

    if (ui.scenarioTitle) {
      ui.scenarioTitle.textContent = state.scenario.title;
    }
    if (ui.scenarioText) {
      ui.scenarioText.textContent = state.scenario.text;
    }
    if (ui.scenarioMeta) {
      ui.scenarioMeta.textContent = state.scenario.meta;
    }

    const ballEtaText =
      state.sequence.phase === "transition" && state.sequence.transition
        ? formatTime(Math.max(0, state.sequence.transition.duration - state.sequence.transition.elapsed))
        : hasBallAction()
          ? formatTime(getRemainingBallTravelTime())
          : "0.00 s";
    const ballProfileText = getBallProfileLabel();
    const displayedBallSpeed = getDisplayedBallSpeed();
    const ballSpeedText = displayedBallSpeed !== null ? formatSpeed(displayedBallSpeed) : "-";
    const ballOwnerText = ballOwner ? `${ballOwner.shortLabel} ${ballOwner.role}` : "None";
    const selectedPlayerText = selectedPlayer ? `${selectedPlayer.shortLabel} ${selectedPlayer.role}` : "No Player Selected";
    const selectedRoleModel = selectedPlayer ? getPlayerRoleModel(selectedPlayer) : null;
    const selectedPhysicalLabel = selectedPlayer
      ? selectedPlayer.physicalProfile?.label ?? getCompetitionPhysicalLabel(state.physicalProfile)
      : "-";
    const selectedPlayerCardMarkup = selectedPlayer
      ? `
    <div class="selected-grid">
      ${renderSelectedMetric("Team", teams[selectedPlayer.team].name, "team")}
      ${renderSelectedMetric("Formation", teams[selectedPlayer.team].formation, "formation")}
      ${renderSelectedProfileControl(selectedPlayer)}
      ${renderSelectedMetric("Role Model", selectedRoleModel?.label ?? "Balanced Role", "roleModel")}
      ${renderSelectedMetric("Physical Level", selectedPhysicalLabel, "physicalProfile")}
      ${renderSelectedMetric("Top Speed", `${selectedPlayer.maxSpeed.toFixed(1)} m/s`, "topSpeed")}
      ${renderSelectedMetric("Acceleration", `${selectedPlayer.acceleration.toFixed(1)} m/s²`, "acceleration")}
      ${renderSelectedMetric("Reaction Time", `${selectedPlayer.reactionTime.toFixed(2)} s`, "reactionTime")}
      ${renderSelectedMetric("Game Intelligence", String(selectedPlayerIntelligence), "gameIntelligence")}
      ${renderSelectedMetric("Can Reach Now", formatMeters(currentReach), "canReachNow")}
      ${renderSelectedMetric("Max Movement in Action", hasBallAction() ? formatMeters(editableRadius) : "Free", "maxMovement")}
      ${renderSelectedMetric(
        "Player Ball Status",
        state.ball.ownerPlayerId === selectedPlayer.id
          ? state.ball.actionType === "dribble"
            ? "Carrying"
            : "On the Ball"
          : "Off the Ball",
        "ballStatus"
      )}
      ${renderSelectedMetric("Distance to Ball", formatMeters(distanceToBall), "distanceToBall")}
      ${renderSelectedMetric(
        "Distance Moved from Action Start",
        hasBallAction() ? formatMeters(movedDistance) : "0.0 m",
        "movedFromStart",
        "selected-span"
      )}
    </div>
  `
      : `<p class="selected-empty">No player selected. Click or box-select a player to inspect them.</p>`;
    const fullscreenSelectedPlayerCardMarkup = selectedPlayer
      ? `
    <div class="selected-grid">
      ${renderSelectedMetric("Top Speed", `${selectedPlayer.maxSpeed.toFixed(1)} m/s`, "topSpeed")}
      ${renderSelectedMetric("Acceleration", `${selectedPlayer.acceleration.toFixed(1)} m/s²`, "acceleration")}
      ${renderSelectedMetric("Reaction Time", `${selectedPlayer.reactionTime.toFixed(2)} s`, "reactionTime")}
      ${renderSelectedMetric("Physical", selectedPhysicalLabel, "physicalProfile")}
      ${renderSelectedMetric("Role", selectedRoleModel?.label ?? "Balanced Role", "roleModel")}
      ${renderSelectedMetric("Profile", selectedPlayer.tendencyProfile?.label ?? "Balanced Profile", "playerProfile")}
      ${renderSelectedMetric("Game Intelligence", String(selectedPlayerIntelligence), "gameIntelligence")}
      ${renderSelectedMetric(
        "Ball Status",
        state.ball.ownerPlayerId === selectedPlayer.id
          ? state.ball.actionType === "dribble"
            ? "Carrying"
            : "On the Ball"
          : "Off the Ball",
        "ballStatus"
      )}
      ${renderSelectedMetric("Distance to Ball", formatMeters(distanceToBall), "distanceToBall")}
      ${renderSelectedMetric("Max Movement", hasBallAction() ? formatMeters(editableRadius) : "Free", "maxMovement")}
    </div>
  `
      : `<p class="selected-empty">No player selected.</p>`;

    ui.simTime.textContent = formatTime(state.time);
    ui.ballStatus.textContent = getBallStatus();
    ui.ballEta.textContent = ballEtaText;
    ui.actionTime.textContent = formatTime(projectedDuration);
    ui.actionType.textContent = getActionTypeLabel();
    ui.ballProfile.textContent = ballProfileText;
    ui.ballCurrentSpeed.textContent = ballSpeedText;
    ui.ballOwner.textContent = ballOwnerText;
    ui.selectedPlayerName.textContent = selectedPlayerText;
    ui.selectedReachAtArrival.textContent = selectedPlayer ? actionDistanceText : "-";
    ui.selectedPlayerCard.innerHTML = selectedPlayerCardMarkup;

    if (ui.fullscreenSimTime) ui.fullscreenSimTime.textContent = formatTime(state.time);
    if (ui.fullscreenBallStatus) ui.fullscreenBallStatus.textContent = getBallStatus();
    if (ui.fullscreenBallEta) ui.fullscreenBallEta.textContent = ballEtaText;
    if (ui.fullscreenActionTime) ui.fullscreenActionTime.textContent = formatTime(projectedDuration);
    if (ui.fullscreenActionType) ui.fullscreenActionType.textContent = getActionTypeLabel();
    if (ui.fullscreenBallProfile) ui.fullscreenBallProfile.textContent = ballProfileText;
    if (ui.fullscreenBallCurrentSpeed) ui.fullscreenBallCurrentSpeed.textContent = ballSpeedText;
    if (ui.fullscreenActionDistance) ui.fullscreenActionDistance.textContent = actionDistanceText;
    if (ui.fullscreenBallOwner) ui.fullscreenBallOwner.textContent = ballOwnerText;
    if (ui.fullscreenSelectedPlayerName) ui.fullscreenSelectedPlayerName.textContent = selectedPlayerText;
    if (ui.fullscreenSelectedReachAtArrival) ui.fullscreenSelectedReachAtArrival.textContent = selectedPlayer ? actionDistanceText : "-";
    if (ui.fullscreenSelectedPlayerCard) ui.fullscreenSelectedPlayerCard.innerHTML = fullscreenSelectedPlayerCardMarkup;

    ui.playerTable.innerHTML = Object.values(teams)
      .map((team) => {
        const rows = state.players
          .filter((player) => player.team === team.id)
          .map((player) => {
            const reachAtArrival = computeReachDistance(player, projectedDuration);
            const moveDistance = distance(getActionOrigin(player), player.position);
            const withinRadius = !hasBallAction() || moveDistance <= getEditableRadius(player) + 0.001;
            const isOwner = state.ball.ownerPlayerId === player.id;
            const selectedClass = isPlayerRenderedSelected(player.id) ? " is-selected" : "";
            const badgeText = !hasBallAction() ? "Free" : withinRadius ? "Inside Radius" : "Outside";
            const badgeClass = !hasBallAction() ? "" : withinRadius ? " is-positive" : " is-negative";
            return `
            <button type="button" class="player-chip${selectedClass}" data-player-id="${player.id}">
              <span class="chip-main${isOwner ? " is-owner" : ""}">${player.shortLabel} ${player.role}</span>
              <span class="chip-meta">
                <small>Max in Action: ${hasBallAction() ? formatMeters(reachAtArrival) : "Free"}</small>
                <small>Moved So Far: ${formatMeters(moveDistance)}</small>
              </span>
              <span class="chip-badge${badgeClass}">${badgeText}</span>
            </button>
          `;
          })
          .join("");
        return `
        <section class="team-block">
          <header class="team-heading">
            <span>${team.name}</span>
            <strong>${team.formation}</strong>
          </header>
          <div class="team-players">${rows}</div>
        </section>
      `;
      })
      .join("");

    ui.eventLog.innerHTML = [...state.eventLog]
      .slice(-8)
      .reverse()
      .map((entry) => `<li>${entry}</li>`)
      .join("");

    if (!state.sequence.steps.length) {
      ui.sequenceStatus.textContent = "No sequence recorded yet.";
      ui.sequenceList.innerHTML = "";
    } else {
      const frameLabel =
        state.sequence.currentFrameIndex < 0
          ? `Viewing start frame • ${state.sequence.steps.length} steps saved`
          : `Viewing step ${state.sequence.currentFrameIndex + 1}/${state.sequence.steps.length}`;
      const statusParts = [frameLabel];
      if (state.sequence.isPlaying && state.sequence.playbackIndex >= 0) {
        statusParts.push(`Playing step ${state.sequence.playbackIndex + 1}/${state.sequence.steps.length}`);
      }
      ui.sequenceStatus.textContent = statusParts.join(" • ");
      ui.sequenceList.innerHTML = state.sequence.steps
        .map((step, index) => {
          const description = describeStep(step, index);
          const isCurrentFrame = !state.sequence.isPlaying && state.sequence.currentFrameIndex === index;
          const isPlaybackFrame = state.sequence.isPlaying && state.sequence.playbackIndex === index;
          const activeClass = isCurrentFrame || isPlaybackFrame ? " is-playing" : "";
          return `
          <article class="sequence-step${activeClass}" data-sequence-frame-index="${index}">
            <img class="sequence-thumb" src="${createStepThumbnail(step.afterSnapshot ?? step.beforeSnapshot)}" alt="${description.title}" />
            <div>
              <strong>${description.title}</strong>
              <small>${description.meta}</small>
            </div>
            <small>${step.speed.toFixed(1)} m/s</small>
          </article>
        `;
        })
        .join("");
    }

    if (!state.savedSequences.length) {
      ui.savedSequenceStatus.textContent = "No central sequences saved yet.";
      ui.savedSequenceList.innerHTML = "";
    } else {
      ui.savedSequenceStatus.textContent = `${state.savedSequences.length} central sequences saved.`;
      ui.savedSequenceList.innerHTML = state.savedSequences
        .map((entry) => {
          const stepCount = entry.sequence?.steps?.length ?? 0;
          const scenarioTitle = entry.sequence?.scenario?.title ?? "Custom Sequence";
          const savedDate = new Date(entry.savedAt).toLocaleString("en-GB");
          return `
          <article class="saved-sequence-item">
            <div class="saved-sequence-head">
              <div>
                <strong>${entry.name}</strong>
                <small>${scenarioTitle}</small>
              </div>
              <small>${stepCount} steps</small>
            </div>
            <p>Saved ${savedDate}</p>
            <div class="saved-sequence-actions">
              <button type="button" class="secondary" data-saved-sequence-action="load" data-saved-sequence-id="${entry.id}">Load</button>
              <button type="button" class="secondary" data-saved-sequence-action="download" data-saved-sequence-id="${entry.id}">Download</button>
              <button type="button" class="secondary" data-saved-sequence-action="delete" data-saved-sequence-id="${entry.id}">Delete</button>
            </div>
          </article>
        `;
        })
        .join("");
    }
  }

  return {
    renderSidebar,
  };
}
