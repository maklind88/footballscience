const groups = [
  ["players", "Players", ["blue-player", "red-player", "neutral-player", "ball", "coach"]],
  ["equipment", "Equipment", ["cone", "mini-goal", "big-goal", "mannequin", "pole", "gate"]],
  ["draw", "Draw", ["arrow", "pass", "run", "line", "dashed-line", "curve", "freehand", "text", "zone", "dashed-zone", "ellipse"]],
];
const strokeTools = new Set(groups[2][2].filter((tool) => tool !== "text"));
const labels = { "mini-goal": "Small goal", "big-goal": "Full-size goal", mannequin: "Mannequin", freehand: "Freehand", "dashed-zone": "Dashed zone", ellipse: "Ellipse" };

function element(doc, tag, className = "", text = "") {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function iconButton(doc, label, symbol) {
  const button = element(doc, "button", "idp-board-icon-button", symbol);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

// Reuse the shared board's controls and event attributes; only IDP owns this layout.
export function mountIdpBoardToolbox(root, state = {}) {
  const modal = root?.querySelector?.(".session-tacticalboard-modal");
  if (!modal || modal.classList.contains("idp-board-editor")) return;
  modal.classList.add("idp-board-editor");
  modal.setAttribute("aria-label", "IDP Player Board");
  const doc = modal.ownerDocument;
  modal.querySelector(".session-library-modal-head > div > span").textContent = "IDP Player Board";
  const toolbox = modal.querySelector(".session-tacticalboard-toolbox");
  const buttons = new Map(Array.from(toolbox.querySelectorAll("[data-session-tactical-tool]"), (button) => [button.dataset.sessionTacticalTool, button]));
  const actions = element(doc, "div", "idp-board-quick-actions");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Board commands");
  const select = iconButton(doc, "Select and move", "\u2196");
  select.dataset.idpBoardSelectTool = "";
  actions.append(select);
  for (const [selector, title, symbol] of [
    ["[data-session-undo-board]", "Undo", "\u21b6"],
    ["[data-session-redo-board]", "Redo", "\u21b7"],
    ["[data-session-delete-tactical-selected]", "Delete selected", ""],
  ]) {
    const button = modal.querySelector(selector);
    button.className = "idp-board-icon-button";
    button.textContent = symbol;
    button.title = title;
    button.setAttribute("aria-label", title);
    if (!symbol) button.append(buttons.get("remove").querySelector("svg").cloneNode(true));
    actions.append(button);
  }
  const erase = buttons.get("remove");
  erase.classList.add("idp-board-icon-button");
  erase.textContent = "\u232b";
  actions.append(erase);
  const tabs = element(doc, "div", "idp-board-tool-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Tool categories");
  const panels = element(doc, "div", "idp-board-tool-panels");
  for (const [key, name, tools] of groups) {
    const tab = element(doc, "button", "", name);
    tab.type = "button";
    tab.id = `idp-tools-tab-${key}`;
    tab.dataset.idpBoardToolGroup = key;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `idp-tools-${key}`);
    tabs.append(tab);
    const panel = element(doc, "div", "idp-board-tool-grid");
    panel.id = `idp-tools-${key}`;
    panel.dataset.idpBoardToolPanel = key;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    for (const tool of tools) {
      const button = buttons.get(tool);
      if (labels[tool]) {
        button.querySelector(".session-tactical-tool-label").textContent = labels[tool];
        button.title = labels[tool];
        button.setAttribute("aria-label", labels[tool]);
      }
      panel.append(button);
    }
    panels.append(panel);
  }
  toolbox.replaceChildren(actions, tabs, panels);
  const inspector = modal.querySelector(".session-tacticalboard-inspector");
  const heading = element(doc, "h3", "idp-board-inspector-title");
  inspector.prepend(heading);
  const number = element(doc, "label", "idp-board-player-number");
  number.append(element(doc, "span", "", "Player number"));
  const input = element(doc, "input");
  input.type = "number";
  input.min = "0";
  input.max = "99";
  input.dataset.idpBoardPlayerNumber = "";
  number.append(input);
  inspector.querySelector(".session-tacticalboard-settings").append(number);
  modal.querySelector(".session-tacticalboard-hint")?.remove();
  const more = element(doc, "details", "idp-board-more-actions");
  more.append(element(doc, "summary", "", "More actions"));
  more.append(modal.querySelector(".session-tacticalboard-upload"), modal.querySelector(".session-tacticalboard-actions"));
  inspector.append(more);
  setIdpBoardToolGroup(root, state.idpPlayerBoardToolGroup || groupForTool(state.idpPlayerBoardTool));
}

function groupForTool(tool) {
  return groups.find(([, , tools]) => tools.includes(tool))?.[0] || "players";
}

export function setIdpBoardToolGroup(root, key) {
  if (!groups.some(([group]) => group === key)) return;
  root.querySelectorAll("[data-idp-board-tool-group]").forEach((tab) => {
    const active = tab.dataset.idpBoardToolGroup === key;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  root.querySelectorAll("[data-idp-board-tool-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.idpBoardToolPanel !== key;
  });
}

export function syncIdpBoardToolbox(root, state = {}, block = {}) {
  const modal = root?.querySelector?.(".idp-board-editor");
  if (!modal) return;
  const tool = state.idpPlayerBoardTool;
  const ids = new Set([state.idpPlayerBoardSelectedElementId, ...(state.idpPlayerBoardSelectedElementIds || [])].filter(Boolean));
  const selected = (block.tacticalElements || []).filter((item) => ids.has(item.id));
  const types = selected.length ? selected.map((item) => item.type) : [tool];
  modal.querySelectorAll("[data-session-tactical-tool]").forEach((button) => {
    const active = button.dataset.sessionTacticalTool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  modal.querySelector("[data-idp-board-select-tool]").setAttribute("aria-pressed", String(!tool));
  modal.querySelector("[data-session-delete-tactical-selected]").disabled = !selected.length;
  modal.querySelector("[data-session-copy-tactical-selected]").disabled = !selected.length;
  modal.querySelector("[data-session-paste-tactical-clipboard]").disabled = !state.idpPlayerBoardClipboard?.length;
  for (const attr of ["width", "style"]) {
    modal.querySelector(`[data-session-tactical-${attr}]`).closest("label").hidden = !types.some((type) => strokeTools.has(type));
  }
  modal.querySelector("[data-session-tactical-color]").closest("label").hidden = !types.some((type) => type && type !== "remove" && type !== "ball");
  modal.querySelector(".session-tacticalboard-arrange").hidden = selected.length < 2;
  const number = modal.querySelector("[data-idp-board-player-number]");
  const player = selected.length === 1 && selected[0].type.endsWith("-player") ? selected[0] : null;
  number.closest("label").hidden = !player;
  if (player && modal.ownerDocument.activeElement !== number) number.value = player.playerNumber ?? player.playerBadge ?? "";
  const toolButton = Array.from(modal.querySelectorAll("[data-session-tactical-tool]")).find((button) => button.dataset.sessionTacticalTool === types[0]);
  modal.querySelector(".idp-board-inspector-title").textContent = selected.length > 1 ? `${selected.length} selected` : toolButton?.title || "Board settings";
}
