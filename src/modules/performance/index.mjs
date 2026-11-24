import { createPerformanceOverview, isValidDate, shiftDate, summarizePlannedRange } from "./performance-overview.mjs";
import { createPerformancePlatformAdapter } from "./performance-platform-adapter.mjs";
import { renderPerformanceRoom, performanceViews } from "./performance-renderer.mjs";

export function createPerformanceSurface(context) {
  const { root, canRead, isActive, getScope, getToday, getTeam, getTeamName, getLogo, openSource } = context;
  const adapter = createPerformancePlatformAdapter(context);
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
      view = "overview";
      playerId = "";
      metric = "minutes";
      range = "7";
      availabilityFilter = "all";
      focusKey = "";
    }
    const sources = adapter.read(date, { includeDrills: view === "drills" });
    const overview = createPerformanceOverview({ date, ...sources });
    const summary = view === "season" ? summarizePlannedRange({ date, range, ...sources }) : null;
    const team = getTeam();
    const focus = focusKey || root.ownerDocument.activeElement?.dataset?.prFocus;
    root.innerHTML = renderPerformanceRoom({
      overview, sources, summary, date, today: getToday(), view, metric, range, playerId, availabilityFilter, canRead,
      escape: context.escapeHtml, teamName: getTeamName(), teamLogo: getLogo(team || {}),
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
        if (prValue !== "session" && !Object.hasOwn(performanceViews, prValue)) return;
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
    if (!isActive() || !event.target.matches("[data-pr-date-picker]") || !isValidDate(event.target.value)) return;
    date = event.target.value;
    render();
  });

  return { render };
}
