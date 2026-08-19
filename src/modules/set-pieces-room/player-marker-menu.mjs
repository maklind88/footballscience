import { setPiecePlayerMarkerModeOptions } from "./constants.mjs";
import { escapeSetPieceHtml } from "./board-renderer.mjs";

const MENU_SELECTOR = "[data-set-piece-player-marker-menu]";

function renderMarkerPreview(mode, player = {}) {
  const label = escapeSetPieceHtml(player.label || "P");
  const photoUrl = String(player.photoUrl || "").trim();
  if (mode === "photo" && photoUrl) {
    return `<span class="spr-player-marker-menu-preview is-photo"><img src="${escapeSetPieceHtml(photoUrl)}" alt=""></span>`;
  }
  return `<span class="spr-player-marker-menu-preview is-initials">${label}</span>`;
}

export function renderSetPiecePlayerMarkerMenu(play = {}, phase = {}, ui = {}, canEdit = false) {
  const menu = ui.playerMarkerMenu;
  if (!menu || !canEdit) return "";
  const player = phase.elements?.find((element) => element.id === menu.elementId && element.kind === "home-player");
  if (!player) return "";
  const playerName = player.playerName || player.label || "Own player";
  const x = Math.max(8, Number(menu.x) || 8);
  const y = Math.max(8, Number(menu.y) || 8);
  return `<section class="spr-player-marker-menu" data-set-piece-player-marker-menu data-element-id="${escapeSetPieceHtml(player.id)}" role="menu" aria-label="Player settings for ${escapeSetPieceHtml(playerName)}" style="--spr-player-menu-x:${x}px;--spr-player-menu-y:${y}px">
    <header class="spr-player-marker-menu-heading"><span>Player marker</span><strong>${escapeSetPieceHtml(playerName)}</strong></header>
    <div class="spr-player-marker-menu-options">
      ${setPiecePlayerMarkerModeOptions.map((option) => {
        const selected = play.playerMarkerMode === option.value;
        const label = option.value === "photo" ? "Profile photo" : "Initials";
        const hint = option.value === "photo" ? "Use the squad profile image" : "Use a compact text marker";
        return `<button type="button" class="spr-player-marker-menu-option ${selected ? "is-selected" : ""}" data-set-piece-player-marker-mode="${option.value}" role="menuitemradio" aria-checked="${selected}">
          ${renderMarkerPreview(option.value, player)}
          <span class="spr-player-marker-menu-copy"><strong>${label}</strong><small>${hint}</small></span>
          <span class="spr-player-marker-menu-check" aria-hidden="true">${selected ? "✓" : ""}</span>
        </button>`;
      }).join("")}
    </div>
    <button type="button" class="spr-player-marker-menu-details" data-set-piece-player-settings="${escapeSetPieceHtml(player.id)}" role="menuitem">
      <span aria-hidden="true">⇄</span><span><strong>Role &amp; assignment</strong><small>Change player or tactical instruction</small></span>
    </button>
    <p class="spr-player-marker-menu-note">Marker style applies to all own players.</p>
  </section>`;
}

export function createSetPiecePlayerMarkerMenuController(options = {}) {
  const { root, ui, win } = options;

  function getPlayer(elementId = "") {
    return options.getContext()?.phase?.elements?.find((element) => (
      element.id === elementId && element.kind === "home-player"
    ));
  }

  function close({ restoreFocus = false } = {}) {
    const elementId = ui.playerMarkerMenu?.elementId || "";
    ui.playerMarkerMenu = null;
    root?.querySelector?.(MENU_SELECTOR)?.remove?.();
    if (restoreFocus && elementId) {
      win.requestAnimationFrame?.(() => root?.querySelector?.(`[data-element-id="${CSS.escape(elementId)}"]`)?.focus?.());
    }
  }

  function open(elementId, x, y) {
    if (ui.presentationMode || !options.canEdit() || !getPlayer(elementId)) return false;
    ui.selectedElementIds = new Set([elementId]);
    ui.selectedDrawingIds?.clear?.();
    ui.selectedDrawingId = "";
    ui.assignmentPickerSlotId = "";
    ui.showAssignments = false;
    ui.playerMarkerMenu = { elementId, x, y };
    options.render();
    win.requestAnimationFrame?.(() => {
      const currentMode = options.getContext()?.play?.playerMarkerMode || "photo";
      root?.querySelector?.(`${MENU_SELECTOR} [data-set-piece-player-marker-mode="${CSS.escape(currentMode)}"]`)?.focus?.();
    });
    return true;
  }

  function handleContextMenu(event) {
    const marker = event.target?.closest?.("[data-element-id]");
    const elementId = marker?.dataset?.elementId || "";
    if (!getPlayer(elementId)) {
      if (ui.playerMarkerMenu) close();
      return false;
    }
    event.preventDefault();
    return open(elementId, event.clientX, event.clientY);
  }

  function handlePointerDown(event) {
    if (ui.playerMarkerMenu && !event.target?.closest?.(MENU_SELECTOR)) close();
  }

  function handleClick(event) {
    const mode = event.target?.closest?.("[data-set-piece-player-marker-mode]")?.dataset?.setPiecePlayerMarkerMode;
    if (mode) {
      close();
      options.setMarkerMode(mode);
      return true;
    }
    const elementId = event.target?.closest?.("[data-set-piece-player-settings]")?.dataset?.setPiecePlayerSettings;
    if (elementId) {
      close();
      options.openPlayerDetails(elementId);
      return true;
    }
    return false;
  }

  function handleKeyDown(event) {
    const menu = root?.querySelector?.(MENU_SELECTOR);
    if (menu) {
      if (event.key === "Escape") {
        event.preventDefault();
        close({ restoreFocus: true });
        return true;
      }
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) && menu.contains(event.target)) {
        event.preventDefault();
        const items = [...menu.querySelectorAll("[role='menuitemradio'], [role='menuitem']")];
        const currentIndex = Math.max(0, items.indexOf(event.target));
        let nextIndex = currentIndex;
        if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
        if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = items.length - 1;
        items[nextIndex]?.focus?.();
        return true;
      }
    }
    const keyboardContextMenu = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!keyboardContextMenu) return false;
    const marker = event.target?.closest?.("[data-element-id]");
    const elementId = marker?.dataset?.elementId || "";
    if (!getPlayer(elementId)) return false;
    const bounds = marker.getBoundingClientRect?.();
    event.preventDefault();
    return open(elementId, (bounds?.right || 0) + 8, bounds?.top || 8);
  }

  return Object.freeze({ close, handleClick, handleContextMenu, handleKeyDown, handlePointerDown });
}
