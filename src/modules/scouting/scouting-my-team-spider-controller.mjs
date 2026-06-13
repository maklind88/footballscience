function normalizeControllerText(value = "", limit = 160, normalizeText = null) {
  if (typeof normalizeText === "function") {
    return normalizeText(value, limit);
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function createScoutingMyTeamSpiderController(deps = {}) {
  const hydrationInFlight = new Set();

  function normalizeText(value = "", limit = 160) {
    return normalizeControllerText(value, limit, deps.normalizeText);
  }

  function getWorkerSearchQuery(player = {}) {
    return (
      deps.getInitialSurnameAlias?.(player.name) ||
      deps.normalizePersonNameForMatch?.(player.name, 120) ||
      normalizeText(player.name, 120)
    );
  }

  function renderShell(shell, player, slot) {
    if (!shell) {
      return false;
    }
    shell.outerHTML = deps.renderSpiderButton?.(player, slot, { renderPanel: true, open: true }) || "";
    bindShells();
    return true;
  }

  async function hydrateShell(shell = null) {
    if (!shell || shell.dataset?.scoutingMyTeamSpiderLoaded === "1") {
      return { changed: false, status: "skipped" };
    }
    const hasRenderedPanel = Boolean(shell.querySelector?.(".scouting-my-team-spider-panel"));
    if (normalizeText(shell.dataset?.scoutingMyTeamSpiderLinked, 160) && hasRenderedPanel) {
      shell.dataset.scoutingMyTeamSpiderLoaded = "1";
      return { changed: false, status: "already-linked" };
    }

    const playerId = normalizeText(shell.dataset?.scoutingMyTeamSpiderShell, 160);
    const player = deps.getPlayerById?.(playerId);
    if (!player) {
      return { changed: false, status: "missing-player" };
    }
    const slotId = normalizeText(shell.closest?.("[data-my-team-slot-role]")?.dataset?.myTeamSlotRole, 40);
    const slot = deps.getSlotById?.(slotId) || null;
    let record = deps.findRecordForPlayer?.(player) || null;

    if (!record && !deps.isDatabaseLoaded?.()) {
      renderShell(shell, player, slot);
      return { changed: true, playerId, status: "rendered-idle" };
    }

    if (!record && deps.canUseWorker?.() === true) {
      if (hydrationInFlight.has(playerId)) {
        return { changed: false, playerId, status: "in-flight" };
      }
      hydrationInFlight.add(playerId);
      try {
        const database = await deps.requestWorkerQuery?.({
          query: {
            ...(deps.getWorkerQueryFromState?.() || {}),
            query: getWorkerSearchQuery(player),
            league: "all",
            team: "all",
            season: "all",
            position: "all",
            minMinutes: 0,
            maxMinutes: 0,
            minAge: "",
            maxAge: "",
            limit: 25,
            offset: 0,
          },
          timeoutMs: 9000,
        });
        (Array.isArray(database?.records) ? database.records : []).forEach((candidate) => {
          deps.registerWorkerRecord?.(candidate);
        });
        deps.clearRecordMatchCache?.();
        record = deps.findRecordForPlayer?.(player) || null;
        if (record) {
          deps.writeState?.({ syncCentral: false, syncShadowBoard: false });
        }
      } catch {
        record = null;
      } finally {
        hydrationInFlight.delete(playerId);
      }
    }

    renderShell(shell, player, slot);
    return { changed: true, linked: Boolean(record), playerId, status: record ? "linked" : "unmatched" };
  }

  function bindShells(root = deps.getRoot?.()) {
    const nodes = root?.querySelectorAll?.("[data-scouting-my-team-spider-shell]") || [];
    nodes.forEach((shell) => {
      if (shell.dataset?.scoutingMyTeamSpiderBound === "1") {
        return;
      }
      shell.addEventListener?.("toggle", () => {
        if (shell.open) {
          void hydrateShell(shell);
        }
      });
      if (shell.dataset) {
        shell.dataset.scoutingMyTeamSpiderBound = "1";
      }
    });
    return nodes.length;
  }

  function getInFlightPlayerIds() {
    return [...hydrationInFlight];
  }

  return {
    bindShells,
    getInFlightPlayerIds,
    hydrateShell,
  };
}
