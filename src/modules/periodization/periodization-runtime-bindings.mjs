import { createPeriodizationSessionBridge } from "./periodization-session-bridge.mjs";
import { createPeriodizationWorkspaceController } from "./periodization-controller.mjs";
import { createPeriodizationWorkspaceShell } from "./periodization-workspace-shell.mjs";

function noop() {}

export function createPeriodizationRuntimeBindings(options = {}) {
  const ui = options.ui || {};
  const renderer = options.renderer || {};
  const canEdit = typeof options.canEdit === "function" ? options.canEdit : () => false;
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : (value) => String(value ?? "");
  const getSessionPlannerState =
    typeof options.getSessionPlannerState === "function" ? options.getSessionPlannerState : () => null;

  function refreshSessionPlannerMatchDayChip() {
    const sessionPlannerState = getSessionPlannerState();
    if (!ui.sessionPlannerWorkspace || !sessionPlannerState) {
      return;
    }
    const headerInfo = ui.sessionPlannerWorkspace.querySelector(".session-blocks-card .session-card-head > div");
    if (!headerInfo) {
      return;
    }
    const existingChip = headerInfo.querySelector(".session-matchday-chip");
    const matchDayLabel = options.getPeriodizationMatchDayLabel?.(
      options.getPeriodizationDay?.(sessionPlannerState.selectedDate)?.matchDay
    );
    if (!matchDayLabel) {
      existingChip?.remove();
      return;
    }
    if (existingChip) {
      existingChip.textContent = `(${matchDayLabel})`;
      return;
    }
    headerInfo.insertAdjacentHTML(
      "beforeend",
      `<strong class="session-matchday-chip">(${escapeHtml(matchDayLabel)})</strong>`
    );
  }

  const sessionPlannerPeriodizationBridge = createPeriodizationSessionBridge({
    ui,
    renderer,
    parseDateValue: options.parseDateValue,
    ensurePeriodizationState: options.ensurePeriodizationState,
    isDateValueInYear: options.isDateValueInYear,
    canEdit,
    writeDay: options.writeDay,
    writePeriodizationState: options.writePeriodizationState,
    renderSessionPlanner: options.renderSessionPlanner,
    getCustomFieldValue: options.getCustomFieldValue,
    getMultiFieldValue: options.getMultiFieldValue,
    isMultiField: options.isMultiField,
    getMultiSelectOpenField: options.getMultiSelectOpenField,
    setMultiSelectOpenField: options.setMultiSelectOpenField,
    setPeriodizationSelection: options.setPeriodizationSelection,
    refreshMatchDayChip: refreshSessionPlannerMatchDayChip,
  });

  const periodizationWorkspaceShell = createPeriodizationWorkspaceShell({
    ui,
    renderer,
    getState: options.getPeriodizationState,
    canEdit,
    getOverlayState: options.getOverlayState,
    setOverlayMode: options.setOverlayMode,
  });
  const {
    renderWorkspace: renderPeriodizationWorkspace,
    refreshBoardMultiFields: refreshPeriodizationBoardMultiFields,
    refreshDependentFields: refreshPeriodizationBoardDependentFields,
  } = periodizationWorkspaceShell;

  const periodizationWorkspaceController = createPeriodizationWorkspaceController({
    ui,
    getState: options.getPeriodizationState,
    canEdit,
    render: renderPeriodizationWorkspace,
    jumpToToday: options.jumpToToday || noop,
    shiftMonth: options.shiftMonth || noop,
    setMonth: options.setMonth || noop,
    selectDate: options.selectDate || noop,
    writeDay: options.writeDay || noop,
    getCustomFieldValue: options.getCustomFieldValue,
    getMultiFieldValue: options.getMultiFieldValue,
    isMultiField: options.isMultiField,
    getMultiSelectOpenField: options.getMultiSelectOpenField,
    setMultiSelectOpenField: options.setMultiSelectOpenField,
    setOverlayState: options.setOverlayState,
    refreshMultiFields: refreshPeriodizationBoardMultiFields,
    refreshDependentFields: refreshPeriodizationBoardDependentFields,
  });

  return Object.freeze({
    periodizationWorkspaceController,
    refreshPeriodizationBoardDependentFields,
    refreshPeriodizationBoardMultiFields,
    refreshSessionPlannerMatchDayChip,
    renderPeriodizationWorkspace,
    renderSessionPlannerPeriodizationOverlay: () => sessionPlannerPeriodizationBridge.renderOverlay(),
    renderSessionPlannerPeriodizationSummary: (dateValue) => sessionPlannerPeriodizationBridge.renderSummary(dateValue),
    sessionPlannerPeriodizationBridge,
  });
}
