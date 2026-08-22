import { gameplanCommandPhases, getGameplanPhaseLabel } from "./gameplan-preparation-selectors.mjs";

function getInitials(name = "") {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "P";
}

function renderAvatar(player = {}, escapeHtml = String, className = "gp-command-avatar") {
  const photoUrl = String(player.photoUrl || "").trim();
  const name = player.name || "Player";
  return `
    <span class="${className}${photoUrl ? " has-photo" : ""}" aria-hidden="true">
      ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy">` : escapeHtml(getInitials(name))}
    </span>
  `;
}

function renderPhaseOptions(selected = "", escapeHtml = String) {
  return gameplanCommandPhases
    .map((phase) => `<option value="${escapeHtml(phase.key)}" ${phase.key === selected ? "selected" : ""}>${escapeHtml(phase.label)}</option>`)
    .join("");
}

function getTargetLabel(item = {}, playersById = new Map()) {
  if (item.targetType === "unit") return item.unit || "Unit not set";
  if (item.targetType === "players") {
    const names = (item.targetIds || item.playerIds || []).map((playerId) => playersById.get(playerId)?.name).filter(Boolean);
    return names.length ? names.join(", ") : "Players not set";
  }
  return "Team";
}

function renderPlanModeSwitch({ mode, canEdit, escapeHtml }) {
  return `
    <div class="gp-command-mode" aria-label="Plan mode">
      <button type="button" class="${mode === "briefing" ? "is-active" : ""}" data-gameplan-plan-mode="briefing">Command</button>
      <button type="button" class="${mode === "edit" ? "is-active" : ""}" data-gameplan-plan-mode="edit" ${canEdit ? "" : "disabled"}>Edit</button>
    </div>
  `;
}

export function renderGameplanCommandHeader(model = {}) {
  const { plan, plans = [], nextUnplannedMatch, mode, canEdit, canDelete, escapeHtml, formatDate } = model;
  const meta = [formatDate(plan.date), plan.kickoff, plan.venue, plan.competition].filter(Boolean).join(" · ");
  return `
    <header class="gp-command-header">
      <div class="gp-command-identity">
        <span>Next match</span>
        <h1>${escapeHtml(plan.title || plan.opponent || "Match plan")}</h1>
        <p>${escapeHtml(meta)}</p>
      </div>
      <div class="gp-command-head-actions">
        <label class="gp-command-plan-picker">
          <span>Match plan</span>
          <select data-gameplan-open-select aria-label="Select match plan">
            ${plans
              .map(
                (item) => `<option value="${escapeHtml(item.id)}" ${item.id === plan.id ? "selected" : ""}>${escapeHtml(
                  `${formatDate(item.date)} · ${item.title || item.opponent || "Match"}`
                )}</option>`
              )
              .join("")}
          </select>
        </label>
        ${
          nextUnplannedMatch && canEdit
            ? `<button type="button" class="gp-command-secondary" data-gameplan-create-match="${escapeHtml(nextUnplannedMatch.id)}">Create ${escapeHtml(
                formatDate(nextUnplannedMatch.date)
              )}</button>`
            : ""
        }
        ${renderPlanModeSwitch(model)}
        ${
          canDelete
            ? `<button type="button" class="gp-command-delete" data-gameplan-delete="${escapeHtml(plan.id)}" title="Delete gameplan">Delete</button>`
            : ""
        }
      </div>
    </header>
  `;
}

export function renderGameplanCommandTabs({ activeTab = "plan", escapeHtml = String } = {}) {
  const tabs = [
    ["plan", "Plan"],
    ["staff", "Staff"],
    ["player-brief", "Player Brief"],
    ["matchday", "Matchday"],
  ];
  return `
    <nav class="gp-command-tabs" aria-label="Gameplan sections">
      ${tabs
        .map(
          ([tab, label]) =>
            `<button type="button" class="${activeTab === tab ? "is-active" : ""}" data-gameplan-tab="${escapeHtml(tab)}">${escapeHtml(label)}</button>`
        )
        .join("")}
    </nav>
  `;
}

function renderPitchPlayer(slot = {}, escapeHtml = String) {
  const player = slot.player;
  return `
    <article class="gp-command-pitch-player${player ? " is-selected" : ""}" style="--x:${Number(slot.x) || 50}%;--y:${Number(slot.y) || 50}%">
      ${player ? renderAvatar(player, escapeHtml, "gp-command-pitch-avatar") : `<span class="gp-command-pitch-empty">${escapeHtml(slot.label)}</span>`}
      <strong>${escapeHtml(player?.name || slot.label)}</strong>
      ${player?.number ? `<small>#${escapeHtml(player.number)}</small>` : ""}
    </article>
  `;
}

function renderLineupPanel(model = {}) {
  const { lineup, escapeHtml } = model;
  const readyLabel = lineup.status === "ready" ? "XI ready" : lineup.status === "partial" ? `${lineup.startingPlayerIds.length}/11 selected` : "XI not selected";
  return `
    <section class="gp-command-lineup" aria-label="Starting eleven from Presentation">
      <header class="gp-command-section-head">
        <div>
          <span>Starting XI</span>
          <h2>${escapeHtml(lineup.formationLabel || "Formation")}</h2>
        </div>
        <div class="gp-command-source-actions">
          <span class="gp-command-source-state ${lineup.status === "ready" ? "is-ready" : ""}">${escapeHtml(readyLabel)}</span>
          <button type="button" data-gameplan-open-presentation="${escapeHtml(lineup.sourceDate || "")}">${lineup.source === "Legacy Gameplan" ? "Move to Presentation" : "Open Presentation"}</button>
        </div>
      </header>
      <div class="gp-command-pitch-wrap">
        <div class="gp-command-pitch" role="img" aria-label="${escapeHtml(`${lineup.formationLabel || "Formation"} starting eleven`)}">
          <span class="gp-command-pitch-half"></span>
          <span class="gp-command-pitch-circle"></span>
          <span class="gp-command-pitch-box is-top"></span>
          <span class="gp-command-pitch-box is-bottom"></span>
          ${lineup.slots.map((slot) => renderPitchPlayer(slot, escapeHtml)).join("")}
        </div>
      </div>
      <footer class="gp-command-bench">
        <div>
          <span>Bench</span>
          <strong>${lineup.benchPlayers.length}</strong>
        </div>
        <div class="gp-command-bench-list">
          ${
            lineup.benchPlayers.length
              ? lineup.benchPlayers
                  .map(
                    (player) => `<article>${renderAvatar(player, escapeHtml)}<span>${escapeHtml(player.name || "Player")}</span></article>`
                  )
                  .join("")
              : `<p>Set the match squad in Presentation.</p>`
          }
        </div>
      </footer>
      <p class="gp-command-provenance">Lineup source · ${escapeHtml(lineup.source)}${lineup.sourceDate ? ` · ${escapeHtml(lineup.sourceDate)}` : ""}</p>
    </section>
  `;
}

function renderFocusItem(item = {}, index = 0, model = {}) {
  const { mode, canEdit, escapeHtml, renderUserOptions, getUserName, players, playersById } = model;
  const sourceLabels = [...new Set((item.sourceRefs || []).map((source) => source.label).filter(Boolean))];
  const assignedPlayers = (item.targetIds || []).map((id) => playersById.get(id)).filter(Boolean);
  if (mode === "edit") {
    return `
      <article class="gp-command-focus-item is-editing">
        <header>
          <strong>${String(index + 1).padStart(2, "0")}</strong>
          <select data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="phaseKey" aria-label="Focus phase">
            ${renderPhaseOptions(item.phaseKey, escapeHtml)}
          </select>
          <label class="gp-command-approve"><input type="checkbox" data-gameplan-focus-approved="${escapeHtml(item.id)}" ${item.approved ? "checked" : ""}> Approved</label>
          <button type="button" data-gameplan-remove-focus="${escapeHtml(item.id)}" title="Remove focus">Remove</button>
        </header>
        <label><span>Principle</span><textarea rows="2" data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="principle">${escapeHtml(item.principle)}</textarea></label>
        <label><span>Match cue</span><textarea rows="2" data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="cue">${escapeHtml(item.cue)}</textarea></label>
        <div class="gp-command-focus-controls">
          <label><span>Owner</span><select data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="ownerUserId">${renderUserOptions(item.ownerUserId)}</select></label>
          <label><span>Target</span><select data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="targetType"><option value="team" ${item.targetType === "team" ? "selected" : ""}>Team</option><option value="unit" ${item.targetType === "unit" ? "selected" : ""}>Unit</option><option value="players" ${item.targetType === "players" ? "selected" : ""}>Players</option></select></label>
          ${
            item.targetType === "unit"
              ? `<label><span>Unit</span><input value="${escapeHtml(item.unit || "")}" data-gameplan-focus="${escapeHtml(item.id)}" data-gameplan-focus-field="unit" placeholder="e.g. Midfield"></label>`
              : ""
          }
          ${
            item.targetType === "players"
              ? `<label><span>Add player</span><select data-gameplan-add-focus-player="${escapeHtml(item.id)}"><option value="">Select player</option>${players
                  .filter((player) => !(item.targetIds || []).includes(player.id))
                  .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`)
                  .join("")}</select></label>`
              : ""
          }
        </div>
        ${
          item.targetType === "players" && assignedPlayers.length
            ? `<div class="gp-command-focus-assignees" aria-label="Assigned players">${assignedPlayers
                .map(
                  (player) => `<button type="button" data-gameplan-remove-focus-player="${escapeHtml(item.id)}" data-gameplan-focus-player-id="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">${escapeHtml(player.name)} <span aria-hidden="true">&times;</span></button>`
                )
                .join("")}</div>`
            : ""
        }
        ${sourceLabels.length ? `<small>Source · ${escapeHtml(sourceLabels.join(" + "))}</small>` : ""}
      </article>
    `;
  }
  return `
    <article class="gp-command-focus-item${item.approved ? " is-approved" : ""}">
      <header><strong>${String(index + 1).padStart(2, "0")}</strong><span>${escapeHtml(getGameplanPhaseLabel(item.phaseKey))}</span>${item.approved ? `<em>Approved</em>` : ""}</header>
      <h3>${escapeHtml(item.principle || "Focus not set")}</h3>
      <p>${escapeHtml(item.cue || "Add the match cue in Edit.")}</p>
      <footer><span>${escapeHtml(item.ownerUserId ? getUserName(item.ownerUserId) : "Owner not set")}</span><span>${escapeHtml(getTargetLabel(item, playersById))}</span></footer>
    </article>
  `;
}

function renderCandidate(candidate = {}, model = {}) {
  const { escapeHtml, canEdit, focusItems } = model;
  const selected = focusItems.some((item) => item.principle.trim().toLowerCase() === candidate.principle.trim().toLowerCase());
  return `
    <article class="gp-command-candidate">
      <div><span>${escapeHtml(getGameplanPhaseLabel(candidate.phaseKey))}</span><strong>${escapeHtml(candidate.principle)}</strong><small>${candidate.dates.length} training day${candidate.dates.length === 1 ? "" : "s"} · ${escapeHtml(candidate.sources.join(" + "))}</small></div>
      <button type="button" data-gameplan-add-focus-candidate="${escapeHtml(candidate.id)}" ${!canEdit || selected || focusItems.length >= 3 ? "disabled" : ""}>${selected ? "Added" : "Add"}</button>
    </article>
  `;
}

function renderFocusPanel(model = {}) {
  const { focusItems, preparation, mode, canEdit, escapeHtml } = model;
  return `
    <section class="gp-command-focus" aria-label="Match focus">
      <header class="gp-command-section-head">
        <div><span>Match focus</span><h2>${focusItems.length}/3 locked</h2></div>
        ${mode === "edit" ? `<button type="button" data-gameplan-add-focus ${!canEdit || focusItems.length >= 3 ? "disabled" : ""}>Add focus</button>` : ""}
      </header>
      <div class="gp-command-focus-list">
        ${
          focusItems.length
            ? focusItems.map((item, index) => renderFocusItem(item, index, model)).join("")
            : `<div class="gp-command-focus-empty"><strong>No match focus locked.</strong><span>Use the work completed this week, then approve up to three cues.</span></div>`
        }
      </div>
      ${
        mode === "edit"
          ? `<section class="gp-command-prepared"><header><span>Prepared this week</span><strong>${preparation.teamCandidates.length}</strong></header><div>${
              preparation.teamCandidates.length
                ? preparation.teamCandidates.slice(0, 8).map((candidate) => renderCandidate(candidate, model)).join("")
                : `<p>No linked team principles found in MD-5 to MD-1.</p>`
            }</div></section>`
          : ""
      }
    </section>
  `;
}

function renderPreparationTimeline(model = {}) {
  const { preparation, escapeHtml } = model;
  return `
    <section class="gp-command-timeline" aria-label="Match preparation timeline">
      <header class="gp-command-section-head"><div><span>Preparation</span><h2>MD-5 to MD-1</h2></div><strong>${preparation.entries.length} linked principle${preparation.entries.length === 1 ? "" : "s"}</strong></header>
      <div class="gp-command-days">
        ${preparation.days
          .map(
            (day) => `<article class="${day.teamPrinciples.length || day.miniGamePrinciples.length ? "has-work" : ""}"><header><strong>${escapeHtml(day.mdLabel)}</strong><span>${escapeHtml(day.date.slice(5))}</span></header><h3>${escapeHtml(day.title || "No linked session")}</h3><div>${day.phaseKeys.map((key) => `<span>${escapeHtml(getGameplanPhaseLabel(key))}</span>`).join("")}</div><footer>${day.teamPrinciples.length} team · ${day.miniGamePrinciples.length} mini</footer></article>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderMiniPrinciple(item = {}, model = {}) {
  const { mode, escapeHtml, players, playersById } = model;
  const assigned = (item.playerIds || []).map((id) => playersById.get(id)).filter(Boolean);
  const phaseLabel = item.phaseKey ? getGameplanPhaseLabel(item.phaseKey) : item.phase || "Mini-game";
  const targetLabel =
    item.targetType === "unit"
      ? item.unit || "Unit not set"
      : item.targetType === "players"
        ? assigned.map((player) => player.name).join(", ") || "Players not set"
        : "Team";

  if (mode !== "edit") {
    return `<article><div><span>${escapeHtml(phaseLabel)}</span><strong>${escapeHtml(item.principle || "Mini-game principle")}</strong><small>${escapeHtml(targetLabel)}</small></div></article>`;
  }

  return `
    <article class="is-editing">
      <div class="gp-command-mini-fields">
        <label>
          <span>Phase</span>
          <select data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="phaseKey">
            <option value="" ${item.phaseKey ? "" : "selected"}>Select phase</option>
            ${renderPhaseOptions(item.phaseKey, escapeHtml)}
          </select>
        </label>
        <label class="gp-command-mini-principle-field">
          <span>Principle</span>
          <input value="${escapeHtml(item.principle || "")}" data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="principle" placeholder="Write the coaching cue">
        </label>
      </div>
      <div class="gp-command-mini-targets">
        <label>
          <span>Target</span>
          <select data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="targetType">
            <option value="team" ${item.targetType === "team" ? "selected" : ""}>Team</option>
            <option value="unit" ${item.targetType === "unit" ? "selected" : ""}>Unit</option>
            <option value="players" ${item.targetType === "players" ? "selected" : ""}>Players</option>
          </select>
        </label>
        ${
          item.targetType === "unit"
            ? `<label><span>Unit</span><input value="${escapeHtml(item.unit || "")}" data-gameplan-mini-principle="${escapeHtml(item.id)}" data-gameplan-mini-field="unit" placeholder="e.g. Back line"></label>`
            : ""
        }
        ${
          item.targetType === "players"
            ? `<label><span>Add player</span><select data-gameplan-add-mini-player="${escapeHtml(item.id)}"><option value="">Select player</option>${players
                .filter((player) => !(item.playerIds || []).includes(player.id))
                .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`)
                .join("")}</select></label>`
            : ""
        }
      </div>
      ${
        item.targetType === "players" && assigned.length
          ? `<div class="gp-command-mini-assignees" aria-label="Assigned players">${assigned
              .map(
                (player) => `<button type="button" data-gameplan-remove-mini-player="${escapeHtml(item.id)}" data-gameplan-mini-player-id="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">${escapeHtml(player.name)} <span aria-hidden="true">&times;</span></button>`
              )
              .join("")}</div>`
          : ""
      }
      <button type="button" class="gp-command-mini-remove" data-gameplan-remove-mini-principle="${escapeHtml(item.id)}">Remove principle</button>
    </article>
  `;
}

function renderMiniPrinciples(model = {}) {
  const { miniGamePrinciples = [], preparation, mode, canEdit, escapeHtml, players, playersById } = model;
  return `
    <section class="gp-command-mini" aria-label="Mini-game principles">
      <header class="gp-command-section-head"><div><span>Mini-game principles</span><h2>Player and unit cues</h2></div>${mode === "edit" ? `<button type="button" data-gameplan-add-mini-principle ${canEdit ? "" : "disabled"}>Add manual</button>` : ""}</header>
      <div class="gp-command-mini-list">
        ${
          miniGamePrinciples.length
            ? miniGamePrinciples.map((item) => renderMiniPrinciple(item, { ...model, players, playersById })).join("")
            : `<p>No mini-game cue assigned to the match.</p>`
        }
      </div>
      ${
        mode === "edit" && preparation.miniGameCandidates.length
          ? `<div class="gp-command-mini-candidates">${preparation.miniGameCandidates
              .slice(0, 8)
              .map((candidate) => `<button type="button" data-gameplan-add-mini-candidate="${escapeHtml(candidate.id)}" ${miniGamePrinciples.some((item) => item.principle === candidate.principle) ? "disabled" : ""}>+ ${escapeHtml(candidate.principle)}</button>`)
              .join("")}</div>`
          : ""
      }
    </section>
  `;
}

function renderCommandSummary(model = {}) {
  const { plan, mode, escapeHtml, lineup, focusItems } = model;
  const objective = plan.summary?.objective || "";
  const audienceCount = plan.playerBrief?.audiencePlayerIds?.length || 0;
  return `
    <section class="gp-command-summary">
      <div class="gp-command-objective"><span>Match intention</span>${mode === "edit" ? `<textarea rows="2" data-gameplan-field="summary.objective" placeholder="State the match intention in the staff's own words.">${escapeHtml(objective)}</textarea>` : `<h2>${escapeHtml(objective || "Match intention not set")}</h2>`}</div>
      <div class="gp-command-readiness"><article><strong>${lineup.startingPlayerIds.length}/11</strong><span>Starting XI</span></article><article><strong>${focusItems.length}/3</strong><span>Match focus</span></article><article><strong>${audienceCount}</strong><span>Player brief</span></article></div>
    </section>
  `;
}

export function renderGameplanCommandPlan(model = {}) {
  return `
    <section class="gp-command-plan ${model.mode === "edit" ? "is-editing" : "is-command"}">
      ${renderCommandSummary(model)}
      <div class="gp-command-primary-grid">
        ${renderLineupPanel(model)}
        ${renderFocusPanel(model)}
      </div>
      ${renderPreparationTimeline(model)}
      ${renderMiniPrinciples(model)}
    </section>
  `;
}
