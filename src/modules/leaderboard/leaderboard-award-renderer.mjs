import {
  leaderboardAwardModes,
  leaderboardPlacementPoints,
  leaderboardSamePointPresets,
} from "./leaderboard-constants.mjs";
import { escapeLeaderboardHtml } from "./leaderboard-helpers.mjs";
import { getLeaderboardDraftAwards, getLeaderboardDraftTotal } from "./leaderboard-selectors.mjs";
import { renderLeaderboardAvatar } from "./leaderboard-ui-helpers.mjs";

function renderModeControl(draft = {}) {
  return `
    <div class="leaderboard-award-modes" role="group" aria-label="Scoring method">
      ${leaderboardAwardModes.map((mode) => `
        <button type="button" class="${draft.mode === mode.id ? "is-active" : ""}" data-leaderboard-award-mode="${mode.id}" aria-pressed="${draft.mode === mode.id}">
          <strong>${escapeLeaderboardHtml(mode.label)}</strong>
          <small>${escapeLeaderboardHtml(mode.description)}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function getVisiblePlayers(players = [], searchQuery = "") {
  const query = String(searchQuery || "").trim().toLowerCase();
  return players.filter((player) => !query || `${player.name} ${player.number} ${player.position}`.toLowerCase().includes(query));
}

function renderPlacementPlayer(player, assignment = {}) {
  const placement = Number(assignment.placement) || 0;
  return `
    <article class="leaderboard-award-player${placement ? " is-selected" : ""}">
      <div class="leaderboard-award-player-copy">
        ${renderLeaderboardAvatar(player)}
        <span><strong>${escapeLeaderboardHtml(player.name)}</strong><small>${escapeLeaderboardHtml([player.number ? `#${player.number}` : "", player.position].filter(Boolean).join(" · ") || "Squad player")}</small></span>
      </div>
      <div class="leaderboard-placement-buttons" role="group" aria-label="Placement for ${escapeLeaderboardHtml(player.name)}">
        ${Object.entries(leaderboardPlacementPoints).map(([place, points]) => `
          <button type="button" class="is-place-${place}${placement === Number(place) ? " is-active" : ""}" data-leaderboard-assign-placement="${place}" data-leaderboard-player-id="${escapeLeaderboardHtml(player.id)}" aria-pressed="${placement === Number(place)}">
            <span>${place}</span><small>+${points}</small>
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function renderSamePointsPlayer(player, assignment = {}, points = 0) {
  const selected = Boolean(assignment.selected);
  return `
    <button type="button" class="leaderboard-award-player leaderboard-award-player-toggle${selected ? " is-selected" : ""}" data-leaderboard-toggle-winner="${escapeLeaderboardHtml(player.id)}" aria-pressed="${selected}">
      <span class="leaderboard-award-player-copy">
        ${renderLeaderboardAvatar(player)}
        <span><strong>${escapeLeaderboardHtml(player.name)}</strong><small>${escapeLeaderboardHtml([player.number ? `#${player.number}` : "", player.position].filter(Boolean).join(" · ") || "Squad player")}</small></span>
      </span>
      <span class="leaderboard-award-points-chip">${selected ? `+${points}` : "Select"}</span>
    </button>
  `;
}

function renderPointPresets(draft = {}) {
  const customActive = draft.customPoints !== "";
  return `
    <div class="leaderboard-point-presets" role="group" aria-label="Points for each selected player">
      ${leaderboardSamePointPresets.map((points) => `
        <button type="button" data-leaderboard-same-points="${points}" class="${!customActive && Number(draft.samePoints) === points ? "is-active" : ""}" aria-pressed="${!customActive && Number(draft.samePoints) === points}">+${points}</button>
      `).join("")}
      <label class="leaderboard-custom-points${customActive ? " is-active" : ""}">
        <span>Custom</span>
        <input type="number" min="1" max="99" inputmode="numeric" value="${escapeLeaderboardHtml(draft.customPoints)}" data-leaderboard-custom-points data-leaderboard-focus-key="award-custom-points" aria-label="Custom points per player" />
      </label>
    </div>
  `;
}

export function renderLeaderboardAwardSheet({ state, players = [], bounds = {}, canEdit = false } = {}) {
  if (!state?.ui?.awardOpen) return "";
  const draft = state.draft || {};
  const visiblePlayers = getVisiblePlayers(players, draft.searchQuery);
  const awards = getLeaderboardDraftAwards(draft);
  const selectedCount = awards.length;
  const total = getLeaderboardDraftTotal(draft);
  const samePoints = draft.customPoints !== "" ? Number(draft.customPoints) || 0 : Number(draft.samePoints) || 0;
  const pending = state.ui.pendingAction === "award";
  return `
    <div class="leaderboard-layer" ${pending ? "" : "data-leaderboard-close-award"}>
      <section class="leaderboard-award-sheet" role="dialog" aria-modal="true" aria-labelledby="leaderboardAwardTitle" data-leaderboard-modal tabindex="-1">
        <form data-leaderboard-award-form novalidate aria-busy="${pending}">
          <header class="leaderboard-sheet-header">
            <div><p>Award event</p><h2 id="leaderboardAwardTitle">Award Points</h2></div>
            <button type="button" class="leaderboard-icon-button" data-leaderboard-close-award aria-label="Close award points" ${pending ? "disabled" : ""}>×</button>
          </header>
          <fieldset class="leaderboard-sheet-scroll leaderboard-award-fieldset" ${pending ? "disabled" : ""}>
            <section class="leaderboard-award-details" aria-label="Competition details">
              <label><span>Date</span><input type="date" min="${escapeLeaderboardHtml(bounds.min)}" max="${escapeLeaderboardHtml(bounds.max)}" value="${escapeLeaderboardHtml(draft.occurredOn)}" data-leaderboard-award-date data-leaderboard-focus-key="award-date" required /></label>
              <label class="is-wide"><span>Competition or activity</span><input type="text" maxlength="160" autocomplete="off" placeholder="e.g. 5v5 tournament" value="${escapeLeaderboardHtml(draft.title)}" data-leaderboard-award-title data-leaderboard-focus-key="award-title" required /></label>
              <label class="is-wide"><span>Note <small>Optional</small></span><textarea rows="2" maxlength="600" placeholder="Context for staff" data-leaderboard-award-note data-leaderboard-focus-key="award-note">${escapeLeaderboardHtml(draft.note)}</textarea></label>
            </section>
            ${renderModeControl(draft)}
            ${draft.mode === "same" ? renderPointPresets(draft) : `
              <div class="leaderboard-placement-key" aria-label="Placement point values">
                <span class="is-gold"><b>1</b> +3 pts</span><span class="is-silver"><b>2</b> +2 pts</span><span class="is-bronze"><b>3</b> +1 pt</span>
              </div>
            `}
            <section class="leaderboard-player-picker" aria-label="Select squad players">
              <div class="leaderboard-picker-head">
                <div><h3>${draft.mode === "same" ? "Winning players" : "Place players"}</h3><p>${draft.mode === "same" ? "Select everyone who earned the same reward." : "Multiple players can share a placement."}</p></div>
                <label><span class="sr-only">Search squad</span><input type="search" value="${escapeLeaderboardHtml(draft.searchQuery)}" placeholder="Search squad…" data-leaderboard-award-search data-leaderboard-focus-key="award-search" /></label>
              </div>
              <div class="leaderboard-award-player-list">
                ${visiblePlayers.length ? visiblePlayers.map((player) => draft.mode === "same"
                  ? renderSamePointsPlayer(player, draft.assignments?.[player.id], samePoints)
                  : renderPlacementPlayer(player, draft.assignments?.[player.id])).join("")
                  : `<div class="leaderboard-picker-empty"><strong>No players found</strong><span>Try another name, number or position.</span></div>`}
              </div>
            </section>
          </fieldset>
          <footer class="leaderboard-sheet-footer">
            <div class="leaderboard-award-preview" aria-live="polite"><strong>${selectedCount}</strong> <span>player${selectedCount === 1 ? "" : "s"}</span><i></i><strong>${total}</strong> <span>points total</span></div>
            ${state.ui.draftError ? `<p class="leaderboard-form-error" role="alert">${escapeLeaderboardHtml(state.ui.draftError)}</p>` : ""}
            <div class="leaderboard-sheet-actions"><button type="button" data-leaderboard-close-award ${pending ? "disabled" : ""}>Cancel</button><button type="submit" class="is-primary" ${!canEdit || pending || !selectedCount ? "disabled" : ""}>${pending ? "Saving…" : "Save award"}</button></div>
          </footer>
        </form>
      </section>
    </div>
  `;
}
