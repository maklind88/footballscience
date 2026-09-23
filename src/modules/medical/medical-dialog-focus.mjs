const focusableSelector = 'button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';
const triggerAttributes = [
  "data-medical-select-player", "data-medical-open-board-plan", "data-medical-open-program-detail",
  "data-medical-open-rtp-profile", "data-medical-rtp-exercise-open", "data-medical-open-rtp-guide-draft",
];

function visible(node) {
  return Boolean(node?.isConnected && node.getClientRects?.().length && !node.closest?.('[hidden], [inert]'));
}

// UI-only focus containment. Clinical form drafts and save handlers retain ownership of data.
export function bindMedicalDialogFocus(workspace, win = globalThis) {
  const doc = workspace?.ownerDocument;
  if (!doc || !win.MutationObserver || !win.requestAnimationFrame) return () => {};
  let active = null;
  let returnTarget = null;
  let returnDescriptor = null;
  let frame = null;

  const topDialog = () => Array.from(workspace.querySelectorAll('[role="dialog"][aria-modal="true"]'))
    .filter(visible)
    .sort((a, b) => {
      const layerZ = (node) => Number(win.getComputedStyle(node.parentElement).zIndex) || 0;
      return layerZ(a) - layerZ(b);
    }).at(-1);

  const focusables = (dialog) => Array.from(dialog.querySelectorAll(focusableSelector))
    .filter((node) => visible(node) && !node.disabled && node.tabIndex >= 0);
  const focusFirst = (dialog) => {
    if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
    (focusables(dialog)[0] || dialog).focus({ preventScroll: true });
  };

  const rememberTrigger = (event) => {
    if (active || !workspace.contains(event.target)) return;
    returnTarget = event.target.closest(focusableSelector) || event.target;
    returnDescriptor = null;
    for (const attr of triggerAttributes) {
      const node = event.target.closest(`[${attr}]`);
      if (node) {
        returnDescriptor = [attr, node.getAttribute(attr)];
        break;
      }
    }
  };

  const reconcile = () => {
    frame = null;
    const next = topDialog();
    if (next === active) return;
    const previous = active;
    active = next;
    if (next) {
      if (!next.contains(doc.activeElement)) focusFirst(next);
    } else if (previous) {
      const [attr, value] = returnDescriptor || [];
      const replacement = attr && Array.from(workspace.querySelectorAll(`[${attr}]`))
        .find((node) => node.getAttribute(attr) === value && visible(node));
      const target = visible(returnTarget) ? returnTarget : replacement;
      target?.focus?.({ preventScroll: true });
    }
  };
  const observer = new win.MutationObserver(() => {
    if (frame === null) frame = win.requestAnimationFrame(reconcile);
  });
  observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden"] });

  const onKeydown = (event) => {
    const confirmation = event.target?.closest?.(".platform-confirm-layer");
    if (event.key === "Escape" && confirmation && topDialog()) {
      // Cancel through the shared dialog, without also closing the Medical draft underneath.
      event.preventDefault();
      event.stopPropagation();
      confirmation.querySelector("[data-platform-confirm-cancel]")?.click();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = topDialog();
    // Shared confirmation dialogs manage their own focus above Medical.
    if (!dialog || doc.activeElement?.closest?.(".platform-confirm-layer")) return;
    const items = focusables(dialog);
    const first = items[0] || dialog;
    const last = items.at(-1) || dialog;
    if (!dialog.contains(doc.activeElement) || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };
  workspace.addEventListener("pointerdown", rememberTrigger, true);
  workspace.addEventListener("keydown", rememberTrigger, true);
  doc.addEventListener("keydown", onKeydown, true);
  reconcile();
  return () => {
    observer.disconnect();
    if (frame !== null) win.cancelAnimationFrame(frame);
    workspace.removeEventListener("pointerdown", rememberTrigger, true);
    workspace.removeEventListener("keydown", rememberTrigger, true);
    doc.removeEventListener("keydown", onKeydown, true);
  };
}
