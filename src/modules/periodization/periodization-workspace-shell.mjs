export function createPeriodizationWorkspaceShell(options = {}) {
  const ui = options.ui || {};
  const renderer = options.renderer || {};
  const getState = typeof options.getState === "function" ? options.getState : () => ({});
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const getOverlayState =
    typeof options.getOverlayState === "function" ? options.getOverlayState : () => ({ open: false, mode: "view" });
  const setOverlayMode = typeof options.setOverlayMode === "function" ? options.setOverlayMode : () => {};

  function refreshBoardMultiField(key) {
    const state = getState();
    if (!state?.selectedDate || !ui.periodizationBoard) return;
    const field = ui.periodizationBoard.querySelector(`[data-periodization-multi-field="${key}"]`);
    const html = renderer.renderMultiFieldForDate?.(key, state.selectedDate);
    if (!field || !html) return;
    field.outerHTML = html;
  }

  function refreshBoardMultiFields(keys = []) {
    Array.from(new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))).forEach((key) => {
      refreshBoardMultiField(key);
    });
  }

  function refreshDependentFields(changedKey = "") {
    if (changedKey === "matchPhases") {
      refreshBoardMultiFields(["subPhases", "teamPrinciples", "miniGamePrinciples"]);
      return;
    }
    if (changedKey === "subPhases") {
      refreshBoardMultiFields(["teamPrinciples", "miniGamePrinciples"]);
    }
  }

  function renderWorkspace() {
    if (!ui.periodizationShell || !ui.periodizationHeading || !ui.periodizationBoard) return;
    const previousOverlay = getOverlayState();
    const previousScrollTop = previousOverlay.open
      ? ui.periodizationBoard.querySelector(".periodization-day-overlay .periodization-day-panel")?.scrollTop ?? 0
      : 0;
    if (!canEdit() && previousOverlay.mode === "edit") {
      setOverlayMode("view");
    }
    const overlayState = getOverlayState();
    const rendered = renderer.renderWorkspace?.(getState(), {
      overlayOpen: Boolean(overlayState.open),
      overlayMode: overlayState.mode === "edit" ? "edit" : "view",
    });
    if (!rendered) return;
    ui.periodizationShell.classList.add("is-coach-board");
    ui.periodizationHeading.textContent = `${rendered.selectedMonthName} ${rendered.selectedYear}`;
    if (ui.periodizationMonthSelect) ui.periodizationMonthSelect.value = String(rendered.selectedMonthIndex);
    if (ui.periodizationWindowLabel) ui.periodizationWindowLabel.textContent = `${rendered.selectedMonthName} ${rendered.selectedYear}`;
    if (ui.periodizationPrevMonthButton) ui.periodizationPrevMonthButton.disabled = rendered.prevDisabled;
    if (ui.periodizationNextMonthButton) ui.periodizationNextMonthButton.disabled = rendered.nextDisabled;
    ui.periodizationBoard.innerHTML = rendered.bodyHtml;
    if (previousOverlay.open && getOverlayState().open) {
      const overlayPanel = ui.periodizationBoard.querySelector(".periodization-day-overlay .periodization-day-panel");
      if (overlayPanel && Number.isFinite(previousScrollTop)) {
        overlayPanel.scrollTop = previousScrollTop;
      }
    }
  }

  return {
    refreshBoardMultiField,
    refreshBoardMultiFields,
    refreshDependentFields,
    renderWorkspace,
  };
}
