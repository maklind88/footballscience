import { createPerformanceOverview, isValidDate, shiftDate, summarizePlannedRange } from "./performance-overview.mjs";
import { createPerformancePlatformAdapter } from "./performance-platform-adapter.mjs";
import { renderPerformanceRoom, performanceViews } from "./performance-renderer.mjs";
import { createLoadPlanController } from "./performance-load-plan-controller.mjs";

export function createPerformanceSurface(context) {
  const { root, canRead, isActive, getScope, getToday, getTeam, getTeamName, getLogo, openSource } = context;
  const adapter = createPerformancePlatformAdapter(context);
  const loadPlan = context.loadPlanningEnabled
    ? createLoadPlanController(context.loadPlanSeed, context.isSampleLoadPlan)
    : null;
  let scope;
  let date;
  let view;
  let playerId;
  let metric;
  let range;
  let availabilityFilter;
  let focusKey;

  function render() {
    if (!isActive()) return;
    const activeScope = getScope();
    if (scope !== activeScope) {
      scope = activeScope;
      date = getToday();
      view = loadPlan && context.openLoadPlan ? "load-plan" : "overview";
      playerId = "";
      metric = "minutes";
      range = "7";
      availabilityFilter = "all";
      focusKey = "";
      loadPlan?.reset();
    }
    const sources = adapter.read(date, { includeDrills: view === "drills" });
    const overview = createPerformanceOverview({ date, ...sources });
    const summary = view === "season" ? summarizePlannedRange({ date, range, ...sources }) : null;
    const team = getTeam();
    const planning = view === "load-plan" ? loadPlan?.getView(overview, sources) : null;
    const focus = focusKey || root.ownerDocument.activeElement?.dataset?.prFocus;
    root.innerHTML = renderPerformanceRoom({
      overview, sources, summary, date, today: getToday(), view, metric, range, playerId, availabilityFilter,
      canRead: context.isSampleLoadPlan ? () => false : canRead,
      escape: context.escapeHtml, teamName: getTeamName(), teamLogo: getLogo(team || {}),
      planning, loadPlanningEnabled: Boolean(loadPlan), isSample: context.isSampleLoadPlan,
    });
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
        if (prValue !== "session" && !(prValue === "load-plan" && loadPlan) && !Object.hasOwn(performanceViews, prValue)) return;
        view = prValue;
        if (view === "players") availabilityFilter = "all";
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
    } else if (view === "load-plan" && loadPlan?.selectFromEvent(event)) {
      render();
    }
  });

  root.addEventListener("submit", (event) => {
    if (view !== "load-plan" || !isActive() || !event.target.matches("[data-pr-load-form]")) return;
    event.preventDefault();
    if (loadPlan.submit(event.target)) render();
  });

  return { render };
}
