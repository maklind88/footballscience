import { renderScoutingComparisonWorkspace } from "./scouting-comparison.mjs";
import { renderScoutingDatabaseWorkspace } from "./scouting-database.mjs";
import { renderScoutingListsWorkspace } from "./scouting-lists.mjs";
import { renderScoutingMyTeamWorkspace } from "./scouting-my-team.mjs";
import { renderScoutingReportsWorkspace } from "./scouting-reports.mjs";
import { renderScoutingShadowXiWorkspace } from "./scouting-shadow-xi.mjs";

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
