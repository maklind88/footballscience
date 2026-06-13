import {
  handleScoutingComparisonChange,
  handleScoutingComparisonClick,
  handleScoutingComparisonInput,
  renderScoutingComparisonWorkspace,
} from "./scouting-comparison.mjs";
import {
  handleScoutingDatabaseChange,
  handleScoutingDatabaseClick,
  handleScoutingDatabaseInput,
  handleScoutingDatabaseSubmit,
  renderScoutingDatabaseWorkspace,
} from "./scouting-database.mjs";
import { handleScoutingListsClick, handleScoutingListsSubmit, renderScoutingListsWorkspace } from "./scouting-lists.mjs";
import {
  handleScoutingMyTeamChange,
  handleScoutingMyTeamClick,
  handleScoutingMyTeamSubmit,
  renderScoutingMyTeamWorkspace,
} from "./scouting-my-team.mjs";
import {
  handleScoutingReportsChange,
  handleScoutingReportsClick,
  handleScoutingReportsSubmit,
  renderScoutingReportsWorkspace,
} from "./scouting-reports.mjs";
import {
  handleScoutingShadowXiChange,
  handleScoutingShadowXiClick,
  handleScoutingShadowXiInput,
  handleScoutingShadowXiSubmit,
  renderScoutingShadowXiWorkspace,
} from "./scouting-shadow-xi.mjs";

export * from "./scouting-defaults.mjs";
export * from "./scouting-state.mjs";
export * from "./scouting-tab-controller.mjs";
export * from "./scouting-post-render-controller.mjs";
export * from "./scouting-profile-spider-service.mjs";
export * from "./scouting-profile-overview-controller.mjs";
export * from "./scouting-profile-market-service.mjs";
export * from "./scouting-profile-timeline-service.mjs";
export * from "./scouting-profile-decision-service.mjs";
export * from "./scouting-database-actions.mjs";
export * from "./scouting-database-background-controller.mjs";
export * from "./scouting-database-loader.mjs";
export * from "./scouting-database-paging-renderer.mjs";
export * from "./scouting-database-refresh-controller.mjs";
export * from "./scouting-database-results-service.mjs";
export * from "./scouting-database-source-policy.mjs";
export * from "./scouting-api-profile-service.mjs";
export * from "./scouting-football-science-db-client.mjs";
export * from "./scouting-football-science-db-adapter.mjs";
export * from "./scouting-football-science-db-models.mjs";
export * from "./scouting-football-science-db-profile-service.mjs";
export * from "./scouting-football-science-db-quality-service.mjs";
export * from "./scouting-comparison-actions.mjs";
export * from "./scouting-decision-state.mjs";
export * from "./scouting-decision-actions.mjs";
export * from "./scouting-click-router.mjs";
export * from "./scouting-drag-drop-helpers.mjs";
export * from "./scouting-drag-drop-router.mjs";
export * from "./scouting-favorites-actions.mjs";
export * from "./scouting-lists-actions.mjs";
export * from "./scouting-mini-radar-service.mjs";
export * from "./scouting-my-team-actions.mjs";
export * from "./scouting-my-team-pitch-service.mjs";
export * from "./scouting-my-team-record-service.mjs";
export * from "./scouting-my-team-spider-controller.mjs";
export * from "./scouting-profile-modal-controller.mjs";
export * from "./scouting-profile-actions.mjs";
export * from "./scouting-reports-actions.mjs";
export * from "./scouting-shadow-xi-actions.mjs";
export * from "./scouting-import-helpers.mjs";
export * from "./scouting-role-scoring-profiles.mjs";
export * from "./scouting-database-filter-service.mjs";
export * from "./scouting-performance.mjs";
export * from "./scouting-role-additional-profiles.mjs";
export * from "./scouting-role-spider-profiles.mjs";

export function renderScoutingActiveContentByTab(deps = {}) {
  const activeTab = deps.activeTab || "shadow-xi";
  if (activeTab === "database") {
    return renderScoutingDatabaseWorkspace(deps);
  }
  if (activeTab === "my-team") {
    return renderScoutingMyTeamWorkspace(deps);
  }
  if (activeTab === "lists") {
    return renderScoutingListsWorkspace(deps);
  }
  if (activeTab === "comparison") {
    return renderScoutingComparisonWorkspace(deps);
  }
  if (activeTab === "reports") {
    return renderScoutingReportsWorkspace(deps);
  }
  if (activeTab === "opposition") {
    return deps.renderFuturePanel(activeTab);
  }
  return renderScoutingShadowXiWorkspace(deps);
}

export function handleScoutingModuleClick(event, deps = {}) {
  return (
    handleScoutingComparisonClick(event, deps) ||
    handleScoutingShadowXiClick(event, deps) ||
    handleScoutingDatabaseClick(event, deps) ||
    handleScoutingListsClick(event, deps) ||
    handleScoutingReportsClick(event, deps) ||
    handleScoutingMyTeamClick(event, deps)
  );
}

export function handleScoutingModuleInput(event, deps = {}) {
  return (
    handleScoutingShadowXiInput(event, deps) ||
    handleScoutingComparisonInput(event, deps) ||
    handleScoutingDatabaseInput(event, deps)
  );
}

export function handleScoutingModuleChange(event, deps = {}) {
  return (
    handleScoutingMyTeamChange(event, deps) ||
    handleScoutingReportsChange(event, deps) ||
    handleScoutingShadowXiChange(event, deps) ||
    handleScoutingComparisonChange(event, deps) ||
    handleScoutingDatabaseChange(event, deps)
  );
}

export function handleScoutingModuleSubmit(event, deps = {}) {
  return (
    handleScoutingShadowXiSubmit(event, deps) ||
    handleScoutingDatabaseSubmit(event, deps) ||
    handleScoutingReportsSubmit(event, deps) ||
    handleScoutingMyTeamSubmit(event, deps) ||
    handleScoutingListsSubmit(event, deps)
  );
}
