import { groupCodingTemplateButtons } from "../services/codingTemplateService.js";
import { renderMiniGamePrincipleLauncher, renderMiniGamePrinciplePicker } from "./MiniGamePrinciplePicker.js";
import { renderPanelBuilderOverlay } from "./PanelBuilderOverlay.js";
import { escapeHtml } from "./renderHelpers.js";
import { renderOutcomeTagLauncher, renderUnitLauncher, renderUnitPicker } from "./UnitOutcomeTags.js";

const hiddenCodingGroups = new Set(["Phase", "Team Principle", "Mini-game Principle", "Outcome"]);

function secondsFromMs(value = 0, fallback = 15) {
  const seconds = Math.round(Number(value || 0) / 1000);
  return Number.isFinite(seconds) ? seconds : fallback;
}

function renderButton(item = {}, state = {}) {
  const targetField = item.targetField || item.type;
  const active = state.codingSession?.activeButtonId === item.id || state.draft?.[targetField] === item.value;
  const durationSeconds = secondsFromMs(item.defaultDurationMs ?? item.endOffsetMs ?? 15000);
  const behavior = item.buttonBehavior || "create_tag";
  return `
    <button type="button" class="video-analysis-code-button${active ? " is-active" : ""}"
      data-video-analysis-code-button="${escapeHtml(item.id)}"
      style="--video-analysis-button-color: ${escapeHtml(item.color || "#143522")}"
      aria-label="${escapeHtml(`${item.label} ${behavior === "create_tag" ? `creates ${durationSeconds} second tag` : behavior}`)}">
      <span class="video-analysis-code-button__label">${escapeHtml(item.label)}</span>
      ${item.hotkey ? `<span class="video-analysis-code-button__meta"><kbd>${escapeHtml(item.hotkey)}</kbd></span>` : ""}
    </button>
  `;
}

function renderButtonGroup(group = "", buttons = [], state = {}) {
  return `
    <section class="video-analysis-code-group" data-video-analysis-code-group="${escapeHtml(group)}">
      <div class="video-analysis-code-group__header">
        <span>${escapeHtml(group)}</span>
      </div>
      <div class="video-analysis-code-grid">
        ${buttons.map((item) => renderButton(item, state)).join("")}
      </div>
    </section>
  `;
}

function playerDisplayName(player = {}) {
  return String(player.name || player.playerName || player.player_label || player.id || "").trim();
}

function playerInitials(player = {}) {
  const name = playerDisplayName(player);
  const number = String(player.number || "").trim();
  if (!name) return number || "P";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function renderPlayerButton(player = {}, state = {}) {
  const id = String(player.id || player.playerId || player.player_id || "").trim();
  if (!id) return "";
  const name = playerDisplayName(player) || id;
  const number = String(player.number || "").trim();
  const position = String(player.position || "").trim();
  const active = state.draft?.playerId === id || state.codingSession?.lastPlayerTagId === id;
  const numberText = number ? `<span class="video-analysis-player-tag-button__number">${escapeHtml(number)}</span>` : "";
  return `
    <button type="button" class="video-analysis-player-tag-button${active ? " is-active" : ""}${number ? " has-number" : ""}"
      data-video-analysis-player-tag="${escapeHtml(id)}"
      title="${escapeHtml(`${name}${position ? ` - ${position}` : ""}`)}"
      aria-label="${escapeHtml(`Tag ${number ? `number ${number}, ` : ""}${name} and send to IDP`)}">
      ${numberText}
      <span class="video-analysis-player-tag-button__initials">${escapeHtml(playerInitials(player))}</span>
    </button>
  `;
}

function renderPlayersPanel(state = {}) {
  const players = Array.isArray(state.players) ? state.players : [];
  return `
    <section class="video-analysis-player-tag-panel" aria-label="Players">
      <div class="video-analysis-code-group__header">
        <span>Players</span>
        ${players.length ? `<small>${players.length}</small>` : ""}
      </div>
      ${players.length ? `
        <div class="video-analysis-player-tag-grid">
          ${players.map((player) => renderPlayerButton(player, state)).join("")}
        </div>
      ` : `
        <p class="video-analysis-player-tag-empty">No squad players available.</p>
      `}
    </section>
  `;
}

function renderMomentTagLaunchers(state = {}) {
  return `
    ${renderMiniGamePrincipleLauncher(state)}
    ${renderUnitLauncher(state)}
    ${renderOutcomeTagLauncher(state)}
  `;
}

export function renderCodingTemplateBuilder(state = {}) {
  const template = state.template || {};
  const editing = state.codingSession?.panelMode === "edit";
  const groups = groupCodingTemplateButtons(template).filter((group) => !hiddenCodingGroups.has(group.label));
  const groupEntries = groups.map((group) => [group.label, group.buttons]);
  const codingState = editing
    ? { ...state, codingSession: { ...(state.codingSession || {}), panelMode: "use" } }
    : state;
  return `
    <section class="video-analysis-template-builder is-coding${editing ? " has-edit-overlay" : ""}" data-video-analysis-code-window>
      <div class="video-analysis-panel-header">
        <div>
          <p class="video-analysis-kicker">Code Window</p>
          <h3>${escapeHtml(template.title || "Football Science Coding")}</h3>
        </div>
        <div class="video-analysis-template-actions">
          <div class="video-analysis-mode-toggle" role="group" aria-label="Code window mode">
            <button type="button" class="${!editing ? "is-active" : ""}" data-video-analysis-panel-mode="use">Code</button>
            <button type="button" class="${editing ? "is-active" : ""}" data-video-analysis-panel-mode="edit">Edit</button>
          </div>
        </div>
      </div>
      <div class="video-analysis-template-scroll">
        ${groupEntries.map(([group, buttons]) => `
          ${renderButtonGroup(group, buttons, codingState)}
          ${group === "Sub-phase" ? renderMomentTagLaunchers(state) : ""}
        `).join("")}
        ${groupEntries.some(([group]) => group === "Sub-phase") ? "" : renderMomentTagLaunchers(state)}
        ${renderPlayersPanel(state)}
      </div>
    </section>
    ${editing ? renderPanelBuilderOverlay(state, groups) : ""}
    ${renderMiniGamePrinciplePicker(state)}
    ${renderUnitPicker(state)}
  `;
}
