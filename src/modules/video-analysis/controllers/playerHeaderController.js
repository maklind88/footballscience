const menuSelector = "#video-analysis-player-settings-menu";
const triggerSelector = "[data-video-analysis-player-settings]";

function closeMenu(root, restoreFocus = false) {
  const menu = root?.querySelector(menuSelector), trigger = root?.querySelector(triggerSelector);
  if (!menu?.matches(":popover-open")) return;
  menu.hidePopover();
  trigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger?.focus();
}

function prepareMenu(root) {
  const menu = root?.querySelector(menuSelector), trigger = root?.querySelector(triggerSelector);
  if (!menu || !trigger) return;
  menu.onbeforetoggle = event => {
    trigger.setAttribute("aria-expanded", String(event.newState === "open"));
    if (event.newState !== "open") return;
    const rect = trigger.getBoundingClientRect();
    menu.style.setProperty("--player-menu-left", `${rect.right - 228}px`);
    menu.style.setProperty("--player-menu-top", `${rect.bottom + 6}px`);
  };
  menu.ontoggle = event => {
    if (event.newState !== "open" || !menu.matches(":popover-open")) return;
    menu.style.setProperty("--player-menu-height", `${menu.getBoundingClientRect().height}px`);
    menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    const lifetime = new AbortController(), signal = lifetime.signal;
    menu.addEventListener("toggle", () => {
      if (!menu.matches(":popover-open")) lifetime.abort();
    }, { signal });
    const win = root.ownerDocument.defaultView;
    win.addEventListener("resize", () => closeMenu(root), { signal, once: true });
    win.addEventListener("scroll", () => closeMenu(root), { signal, once: true });
  };
}

export function handlePlayerHeaderClick(event, root) {
  const target = event.target?.closest ? event.target : event.target?.parentElement;
  if (target?.closest(triggerSelector)) {
    prepareMenu(root);
    return false;
  }
  if (target?.closest(`${menuSelector} button`)) closeMenu(root);
  return false;
}

export function handlePlayerHeaderKeydown(event, root) {
  const target = event.target?.closest ? event.target : event.target?.parentElement;
  if (target?.closest(triggerSelector) && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault(); event.stopPropagation();
    target.closest(triggerSelector).click();
    if (event.key === "ArrowUp") root.querySelector(menuSelector)?.addEventListener("toggle", () =>
      [...root.querySelectorAll(`${menuSelector} button:not(:disabled)`)].at(-1)?.focus({ preventScroll: true }), { once: true });
    return true;
  }
  const menu = root?.querySelector(menuSelector);
  if (!menu?.matches(":popover-open")) return false;
  event.stopPropagation();
  if (["Escape", "Tab"].includes(event.key)) {
    closeMenu(root, true);
    if (event.key === "Escape") event.preventDefault();
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const items = [...menu.querySelectorAll("button:not(:disabled)")], index = items.indexOf(target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  }
  return true;
}
