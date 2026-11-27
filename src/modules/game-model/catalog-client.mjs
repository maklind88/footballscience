const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createGameModelCatalogClient({ request, getAuthToken, getCurrentUser, getActiveTeam }) {
  let snapshot = null;
  let pending = null;

  function currentScope() {
    const userId = String(getCurrentUser()?.id || "");
    const activeTeamId = String(getActiveTeam()?.id || "");
    const teamId = uuidPattern.test(activeTeamId) ? activeTeamId : "";
    return { userId, teamId, key: userId ? `${userId}:${activeTeamId}` : "" };
  }

  function getSnapshot() {
    return snapshot?.scope === currentScope().key ? snapshot.catalog : null;
  }

  async function send(url, options, scope) {
    const token = await getAuthToken();
    if (!token || !scope.userId || currentScope().key !== scope.key) {
      throw new Error("Sign in to open Game Model.");
    }
    const response = await request(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options?.headers },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (currentScope().key !== scope.key) throw new Error("Your active team changed.");
    if (!response.ok || !payload?.ok) {
      const error = new Error(payload?.reason || "Game Model could not be reached. Try again.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function getCatalog() {
    const scope = currentScope();
    if (pending?.scope === scope.key) return pending.promise;
    const path = scope.teamId ? `/api/game-model?teamId=${encodeURIComponent(scope.teamId)}` : "/api/game-model";
    const promise = send(path, {}, scope).then((catalog) => {
      if (!uuidPattern.test(catalog.teamId) || (scope.teamId && scope.teamId !== catalog.teamId) || !Array.isArray(catalog.items)) {
        throw new Error("The Game Model catalogue could not be read for this team.");
      }
      snapshot = { scope: scope.key, catalog };
      return catalog;
    }).finally(() => {
      if (pending?.promise === promise) pending = null;
    });
    pending = { scope: scope.key, promise };
    return promise;
  }

  async function saveItem(item, teamId) {
    const scope = currentScope();
    const current = getSnapshot();
    if (!current?.canEdit || current.teamId !== teamId) {
      throw new Error("Reload Game Model for your active team.");
    }
    // A read started before this edit must settle before the new row is cached.
    if (pending?.scope === scope.key) await pending.promise;
    const result = await send("/api/game-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, item }),
    }, scope);
    const latest = getSnapshot();
    if (latest?.teamId === teamId) {
      const items = latest.items.filter((entry) => entry.id !== result.item.id).concat(result.item);
      snapshot = { scope: scope.key, catalog: { ...latest, items } };
    }
    return result;
  }

  return { getCatalog, getSnapshot, saveItem, getScopeKey: () => currentScope().key };
}
