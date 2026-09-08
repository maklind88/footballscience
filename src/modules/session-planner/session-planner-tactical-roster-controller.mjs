import { createSessionPlannerPlayerBoardHelpers } from "./session-planner-player-board-helpers.mjs";
import { isSquadPlayerTemporaryActiveOnDate } from "../squad/players.mjs";
import { getTacticalPlayerIdentityFields, isTacticalRosterPlayer, normalizeTacticalPlayerIdentity,
  updateTacticalPlayerIdentity } from "./session-planner-tactical-player-identity.mjs";

const { getInitialLabelMap } = createSessionPlannerPlayerBoardHelpers();
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");

export function getTacticalRosterChoices(players, date) {
  const eligible = (Array.isArray(players) ? players : []).filter((player) => player?.id && player.name
    && !player.archivedAt && !player.deletedAt && isSquadPlayerTemporaryActiveOnDate(player, date));
  const labels = getInitialLabelMap(eligible.map((player) => ({ player })));
  return eligible.map((player) => normalizeTacticalPlayerIdentity({
    squadPlayerId: player.id, name: player.name, number: player.number,
    initials: labels.get(player.id), photoUrl: player.photoUrl,
  })).filter(Boolean);
}

export function createTacticalRosterController({ getWorkspace, getBlock, getSelectedIds, getPlayers,
  getDate, canEdit, persist, refreshCanvas }) {
  const mounted = new WeakSet();
  let query = "";
  let selectionKey = "";

  const selectedPlayers = () => {
    const selected = new Set(getSelectedIds());
    return (getBlock()?.tacticalElements || []).filter((element) => selected.has(element.id) && isTacticalRosterPlayer(element));
  };
  const choices = () => getTacticalRosterChoices(getPlayers(), getDate());

  function renderOptions(players, selectedId) {
    const matching = players.filter((player) => `${player.name} ${player.number}`.toLowerCase().includes(query.toLowerCase()));
    const selected = players.find((player) => player.squadPlayerId === selectedId);
    if (selected && !matching.includes(selected)) matching.unshift(selected);
    return `<option value="">${query && !matching.length ? "No matches" : "Generic player"}</option>`
      + matching.map((player) => `<option value="${escapeHtml(player.squadPlayerId)}" ${player.squadPlayerId === selectedId ? "selected" : ""}>
        ${escapeHtml(player.name)}${player.number ? ` (${escapeHtml(player.number)})` : ""}</option>`).join("");
  }

  function playerOptions(players, identity) {
    return renderOptions(players, identity?.squadPlayerId)
      + (identity && !players.some((player) => player.squadPlayerId === identity.squadPlayerId)
        ? `<option value="${escapeHtml(identity.squadPlayerId)}" selected>${escapeHtml(identity.name)} (saved)</option>` : "");
  }

  function sync() {
    const panel = getWorkspace()?.querySelector("[data-session-tactical-roster-panel]");
    if (!panel) return;
    const selected = selectedPlayers();
    panel.hidden = !selected.length;
    if (!selected.length) {
      selectionKey = "";
      query = "";
      delete panel.dataset.renderSignature;
      return;
    }
    const key = `${getBlock()?.id}:${selected.map((element) => element.id).join(",")}`;
    if (key !== selectionKey) { selectionKey = key; query = ""; }
    const players = choices();
    const fields = selected.map(getTacticalPlayerIdentityFields);
    const linked = fields.every((field) => field.playerIdentity);
    const mode = fields.every((field) => field.playerDisplay === fields[0].playerDisplay) ? fields[0].playerDisplay : "";
    const identity = selected.length === 1 ? fields[0].playerIdentity : null;
    const signature = JSON.stringify([key, fields, players, canEdit()]);
    if (panel.dataset.renderSignature === signature) return;
    panel.dataset.renderSignature = signature;
    panel.innerHTML = `<fieldset class="session-tactical-roster-fields" ${canEdit() ? "" : "disabled"}>
      <legend>Player${selected.length > 1 ? `s (${selected.length})` : ""}</legend>
      ${selected.length === 1 ? `<input type="search" aria-label="Find squad player" placeholder="Find player" value="${escapeHtml(query)}" data-tactical-roster-search>
        <select aria-label="Squad player" data-tactical-roster-player>
          ${playerOptions(players, identity)}
        </select>` : ""}
      <div class="session-tactical-player-modes" role="group" aria-label="Player display">
        ${["number", "initials", "photo"].map((value) => `<label><input type="radio" name="session-tactical-player-display"
          value="${value}" data-tactical-roster-display ${linked ? "" : "disabled"} ${mode === value ? "checked" : ""}>
          <span>${value[0].toUpperCase() + value.slice(1)}</span></label>`).join("")}
      </div>
    </fieldset>`;
  }

  function change(event) {
    if (!canEdit() || !event.target.closest?.("[data-session-tactical-roster-panel]")) return;
    const selected = selectedPlayers();
    const block = getBlock();
    let patch;
    if (event.target.matches("[data-tactical-roster-player]") && selected.length === 1) {
      const id = event.target.value;
      const identity = choices().find((player) => player.squadPlayerId === id);
      if (id && !identity) return;
      patch = { playerIdentity: identity || null };
    } else if (event.target.matches("[data-tactical-roster-display]")) {
      patch = { playerDisplay: event.target.value };
    }
    if (!patch) return;
    event.stopPropagation();
    if (updateTacticalPlayerIdentity(block, selected.map((element) => element.id), patch)) {
      persist(block);
      refreshCanvas();
    }
    sync();
  }

  function search(event) {
    if (!event.target.matches?.("[data-tactical-roster-search]")) return;
    query = event.target.value;
    const select = event.target.closest("[data-session-tactical-roster-panel]")?.querySelector("[data-tactical-roster-player]");
    if (select) select.innerHTML = playerOptions(choices(), getTacticalPlayerIdentityFields(selectedPlayers()[0]).playerIdentity);
  }

  function mount() {
    const root = getWorkspace();
    if (!root) return;
    if (!mounted.has(root)) {
      root.addEventListener("change", change);
      root.addEventListener("input", search);
      mounted.add(root);
    }
    sync();
  }
  return { mount, sync };
}
