const columns = [".squad-table-season", ".squad-table-recent"];

// A display-only handover between renders, never a cache of Medical source data.
export function createSquadAvailabilityDisplay({ getWorkspace, getCurrentUser, getTeam, getScope = () => {
  const user = getCurrentUser?.();
  return user ? JSON.stringify([user, getTeam?.(user)?.id, new Date().toDateString()]) : "";
} }) {
  let scope = "";
  let cellsByPlayer = new Map();

  function capture() {
    const nextScope = getScope?.() || "";
    const cells = new Map();
    if (nextScope && nextScope === scope) {
      getWorkspace()?.querySelectorAll?.("[data-player-profile-select]").forEach((row) => {
        cells.set(row.dataset.playerProfileSelect, columns.map((selector) => {
          const cell = row.querySelector(`${selector} .squad-availability-cell`);
          if (!cell || (cell.getAttribute("aria-busy") === "true" && !cell.hasAttribute("data-availability-refreshing"))) return null;
          return cell.cloneNode(true);
        }));
      });
    }
    scope = nextScope;
    cellsByPlayer = cells;
  }

  function restore() {
    if (!scope || scope !== getScope?.()) {
      cellsByPlayer.clear();
      return;
    }
    getWorkspace()?.querySelectorAll?.("[data-player-profile-select]").forEach((row) => {
      const previous = cellsByPlayer.get(row.dataset.playerProfileSelect);
      columns.forEach((selector, index) => {
        const pending = row.querySelector(`${selector} .squad-availability-cell[aria-busy="true"]`);
        if (!pending || !previous?.[index]) return;
        const cell = previous[index].cloneNode(true);
        cell.setAttribute("aria-busy", "true");
        cell.setAttribute("data-availability-refreshing", "");
        cell.title = "Updating availability; showing previous calculation.";
        pending.replaceWith(cell);
      });
    });
    cellsByPlayer.clear();
  }

  return { capture, restore };
}
