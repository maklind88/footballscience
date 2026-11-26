import { createPerformanceOverview, isValidDate, shiftDate, summarizePlannedRange, weekDates } from "./performance-overview.mjs";
import { createPerformancePlatformAdapter } from "./performance-platform-adapter.mjs";
import { renderPerformanceRoom, performanceViews } from "./performance-renderer.mjs";
import { createLoadPlanApi } from "./performance-load-plan-api.mjs";
import { createLoadPlanController } from "./performance-load-plan-controller.mjs";
import { updateTeamWeekTotals } from "./performance-team-week-matrix.mjs";
import { createGpsHistory } from "./performance-gps-history.mjs";
import { updateGpsDelta } from "./performance-week-gps.mjs";

export function createPerformanceSurface(context) {
  const { root, canRead, isActive, getScope, getToday, getTeam, getTeamName, getLogo, openSource } = context;
  const adapter = createPerformancePlatformAdapter(context);
  const persistence = context.getLoadPlanToken ? createLoadPlanApi(context.getLoadPlanToken) : null;
  const loadPlan = context.loadPlanningEnabled
    ? createLoadPlanController(context.loadPlanSeed, context.isSampleLoadPlan, persistence, render)
    : null;
  const gpsHistory = persistence ? createGpsHistory(persistence.readGpsHistory, render) : null;
  let scope;
  let date;
  let view;
  let playerId;
  let metric;
  let range;
  let availabilityFilter;
  let focusKey;

  function render() {
    if (!isActive()) {
      gpsHistory?.reset();
      return;
    }
    const activeScope = getScope();
    if (scope !== activeScope) {
      scope = activeScope;
      const profileId = context.initialLoadPlanPlayer?.();
      view = loadPlan && (context.openLoadPlan || profileId) ? "load-plan" : "overview";
      if (gpsHistory && context.openGpsHistory) view = "gps-history";
      const requestedDate = context.initialLoadPlanDate;
      date = ["load-plan", "gps-history"].includes(view) && isValidDate(requestedDate) ? requestedDate : getToday();
      playerId = "";
      metric = "minutes";
      range = "7";
      availabilityFilter = "all";
      focusKey = "";
      loadPlan?.reset();
      gpsHistory?.reset();
      if (view === "load-plan" && profileId) loadPlan.openPlayer(profileId);
    }
    const sources = adapter.read(date, { includeDrills: view === "drills" });
    const overview = createPerformanceOverview({ date, ...sources });
    const summary = view === "season" ? summarizePlannedRange({ date, range, ...sources }) : null;
    const team = getTeam();
    const planning = view === "load-plan" ? loadPlan?.getView(overview, sources) : null;
    const history = view === "gps-history" ? gpsHistory?.getWeek(weekDates(date)[0]) : null;
    const focus = focusKey || root.ownerDocument.activeElement?.dataset?.prFocus;
    const previousMatrix = root.querySelector(".pr-week-grid-wrap");
    const matrixScroll = previousMatrix ? { left: previousMatrix.scrollLeft, top: previousMatrix.scrollTop } : null;
    root.innerHTML = renderPerformanceRoom({
      overview, sources, summary, date, today: getToday(), view, metric, range, playerId, availabilityFilter,
      canRead: context.isSampleLoadPlan ? () => false : canRead,
      escape: context.escapeHtml, teamName: getTeamName(), teamLogo: getLogo(team || {}),
      planning, history, gpsHistoryEnabled: Boolean(gpsHistory), loadPlanningEnabled: Boolean(loadPlan), isSample: context.isSampleLoadPlan,
    });
    if (matrixScroll) root.querySelector(".pr-week-grid-wrap")?.scrollTo(matrixScroll);
    if (focus) {
      const match = Array.from(root.querySelectorAll("[data-pr-focus]")).find((element) => element.dataset.prFocus === focus);
      // Restore focus without changing the page's scroll position during central refreshes.
      match?.focus({ preventScroll: true });
    }
    focusKey = "";
  }

  root.addEventListener("click", (event) => {
    const control = event.target.closest("[data-pr-action]");
    if (!isActive() || !control || !root.contains(control)) return;
    const { prAction, prValue, prDate } = control.dataset;
    switch (prAction) {
      case "source":
        openSource(prValue, isValidDate(prDate) ? prDate : undefined);
        return;
      case "view":
        if (prValue === "gps-history" && !gpsHistory) return;
        if (prValue !== "session" && !(prValue === "load-plan" && loadPlan) && !Object.hasOwn(performanceViews, prValue)) return;
        if (view === "gps-history" && prValue !== view) gpsHistory.reset();
        view = prValue;
        if (view === "players") availabilityFilter = "all";
        break;
      case "gps-history-retry":
        if (view !== "gps-history") return;
        gpsHistory.reset();
        break;
      case "day":
        if (!isValidDate(prValue)) return;
        date = prValue;
        if (view === "season") view = "session";
        break;
      case "week":
        date = shiftDate(date, Number(prValue) * 7);
        break;
      case "today":
        date = getToday();
        break;
      case "metric":
        metric = prValue;
        break;
      case "range":
        range = prValue;
        break;
      case "player":
        playerId = prValue;
        view = "player";
        break;
      case "availability":
        availabilityFilter = prValue;
        view = "players";
        break;
      case "plan-reload":
        if (view !== "load-plan" || !loadPlan) return;
        loadPlan.reload();
        break;
      case "plan-mode":
        if (view !== "load-plan" || !loadPlan?.setMode(prValue)) return;
        break;
      case "plan-player":
        if (!loadPlan) return;
        loadPlan.openPlayer(prValue);
        view = "load-plan";
        focusKey = "plan-player";
        render();
        return;
      case "plan-review-day":
      case "plan-review-activity":
        if (view !== "load-plan" || !loadPlan?.setReviewSelection(prValue, prAction === "plan-review-day")) return;
        break;
      case "plan-review-jump":
        if (view !== "load-plan" || !isValidDate(prDate) || prDate === date || !loadPlan?.requestReviewJump(prDate, prValue)) return;
        date = prDate;
        break;
      case "plan-review-metric":
        if (view !== "load-plan" || !loadPlan?.setReviewMetric(prValue)) return;
        break;
      case "plan-review-edit":
        if (view !== "load-plan" || !loadPlan?.setReviewEditing(prValue)) return;
        break;
      case "plan-week-goals":
        if (view !== "load-plan" || !loadPlan?.toggleGoals()) return;
        break;
      case "plan-team-gps":
        if (view !== "load-plan" || !loadPlan?.toggleGpsComparison()) return;
        break;
      case "plan-team-view":
        if (view !== "load-plan" || !loadPlan?.selectTeamView(prValue)) return;
        break;
      case "plan-team-activity":
        if (view !== "load-plan" || !loadPlan?.selectActivity(prValue)) return;
        focusKey = "team-activity-selector";
        render();
        root.querySelector(".pr-team-editor")?.scrollIntoView({ block: "start" });
        return;
      case "plan-team-fill":
      case "plan-team-fill-selected":
        if (view === "load-plan") loadPlan?.fillTeamActivity(control.closest("form"), prAction === "plan-team-fill-selected");
        return;
      case "plan-reference":
        if (view !== "load-plan" || !loadPlan?.selectReference(prValue)) return;
        focusKey = "plan-reference-scope";
        render();
        return;
      default:
        return;
    }
    focusKey = control.dataset.prFocus;
    if (["availability", "player"].includes(prAction) || (prAction === "view" && !control.closest(".pr-navigation"))) {
      focusKey = "detail-title";
    }
    render();
  });

  root.addEventListener("change", (event) => {
    if (!isActive()) return;
    if (event.target.matches("[data-pr-date-picker]") && isValidDate(event.target.value)) {
      date = event.target.value;
      render();
    } else if (view === "gps-history" && event.target.matches("[data-pr-gps-history-player]")) {
      gpsHistory.selectPlayer(event.target.value);
      render();
    } else if (view === "load-plan" && loadPlan?.selectFromEvent(event)) {
      render();
    }
  });

  root.addEventListener("input", (event) => {
    if (view !== "load-plan" || !isActive() || !event.target.matches("input[type=text]")) return;
    const change = loadPlan?.rememberTeamInput(event.target);
    if (change) updateTeamWeekTotals(change.row, change.totals);
    updateGpsDelta(event.target);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || view !== "load-plan" || !isActive()) return;
    if (event.target.matches('[data-pr-load-form="team-week"] input')) {
      event.preventDefault();
      return;
    }
    if (event.target.matches('[data-pr-load-form="team-activity"] input[name^="bulk-"]')) {
      event.preventDefault();
      loadPlan?.fillTeamActivity(event.target.form);
    }
  });

  root.addEventListener("submit", (event) => {
    if (view !== "load-plan" || !isActive() || !event.target.matches("[data-pr-load-form]")) return;
    event.preventDefault();
    void loadPlan.submit(event.target);
  });

  return { render };
}
