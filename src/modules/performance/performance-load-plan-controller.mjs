import { createLoadPlanDraft, createLoadPlanWeek, planningRole } from "./performance-load-plan.mjs";

export function createLoadPlanController(seed, isSample) {
  const modes = new Set(["team", "player", "references"]);
  let draft;
  let mode;
  let playerId;
  let referenceScope;
  let status;
  let players = [];
  let activities = [];

  function reset() {
    draft = createLoadPlanDraft(seed);
    mode = "team";
    playerId = "";
    referenceScope = "team";
    status = "";
  }

  function setMode(value) {
    if (!modes.has(value)) return false;
    mode = value;
    status = "";
    return true;
  }

  function selectPlayer(value) {
    if (!players.some((player) => player.id === value)) return false;
    playerId = value;
    status = "";
    return true;
  }

  function hasReferenceScope(value) {
    return value === "team" || players.some((player) =>
      value === `player:${player.id}` || (planningRole(player) && value === `role:${planningRole(player)}`)
    );
  }

  function selectReference(value) {
    if (!hasReferenceScope(value)) return false;
    referenceScope = value;
    setMode("references");
    return true;
  }

  function selectFromEvent(event) {
    if (event.target.matches("[data-pr-plan-player]")) return selectPlayer(event.target.value);
    if (event.target.matches("[data-pr-reference-scope]")) return selectReference(event.target.value);
    return false;
  }

  function getView(overview, sources) {
    const days = createLoadPlanWeek(overview, sources.events);
    players = overview.squad;
    activities = days.flatMap((day) => day.activities);
    if (!hasReferenceScope(referenceScope)) referenceScope = "team";
    const selected = players.find(({ id }) => id === playerId) ?? players[0];
    playerId = selected?.id ?? "";
    return { days, players, selected, mode, referenceScope, status, draft, isSample };
  }

  function submit(form) {
    const fields = new FormData(form);
    const isPlayerPlan = form.dataset.prLoadForm === "player";
    const invalid = isPlayerPlan ? draft.savePlayerWeek(playerId, activities, fields) : draft.saveReference(referenceScope, fields);
    if (invalid.length) {
      const message = "Enter non-negative values. Use up to three decimal places for km and whole meters for HSR and sprint.";
      for (const input of form.querySelectorAll("input")) {
        if (invalid.includes(input.name)) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
      form.elements.namedItem(invalid[0])?.focus();
      form.closest(".pr-plan-workbench").querySelector(".pr-plan-status").textContent = message;
      return false;
    }
    status = isPlayerPlan ? "Player plan saved in this tab. Team week updated." : "Reference saved in this tab.";
    return true;
  }

  return {
    reset, selectFromEvent, selectReference, setMode, getView, submit,
    openPlayer: (value) => {
      playerId = value;
      setMode("player");
    },
  };
}
