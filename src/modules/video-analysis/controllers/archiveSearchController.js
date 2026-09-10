const PAGE_SIZE = 8;

function queryFor(state) {
  const filters = state.library?.filters || {};
  return { search: String(filters.search || "").trim(), date: filters.date || "", type: filters.type || "all" };
}

function hasSearch(query) {
  return Boolean(query.search || query.date || query.type !== "all");
}

function scopeKey(context = {}) {
  const actor = context.currentUser || {};
  return JSON.stringify([actor.id, actor.clubId || actor.organizationId, actor.teamId]);
}

export function createArchiveSearchController({ getRuntime, shouldLoadMetadata }) {
  let request = null;
  let generation = 0;
  let debounce = null;
  let unsubscribe = null;
  let boundScope = "";
  const update = (archive) => getRuntime()?.store.update((state) => ({
    ...state, library: { ...state.library, archive },
  }));

  function cancel() {
    generation += 1;
    request?.abort();
    request = null;
    clearTimeout(debounce);
    debounce = null;
  }

  function bind() {
    const run = getRuntime();
    if (!run) return;
    const scope = scopeKey(run.context);
    if (boundScope && boundScope !== scope) {
      cancel();
      boundScope = scope;
      update(null);
    }
    boundScope = scope;
    if (!unsubscribe) {
      unsubscribe = run.store.subscribe((state) => {
        if (state.view !== "library") cancel();
      });
    }
  }

  async function load({ page = 0 } = {}) {
    bind();
    const run = getRuntime();
    if (!run || run.store.getState().view !== "library") return;
    cancel();
    const state = run.store.getState();
    const query = queryFor(state);
    if (!hasSearch(query) || !shouldLoadMetadata(run.context, state)) {
      update(null);
      return;
    }
    const old = state.library?.archive || {};
    const queryKey = JSON.stringify(query);
    const cursors = page === 0 || queryKey !== old.queryKey ? [null] : [...(old.cursors || [null])];
    if (page > 0 && !cursors[page]) return;
    const token = generation;
    const scope = scopeKey(run.context);
    request = new AbortController();
    update({ matches: [], page, cursors, queryKey, status: "loading", error: "", hasMore: false });
    try {
      const payload = await run.videos.searchArchive({ ...query, cursor: cursors[page], limit: PAGE_SIZE }, { signal: request.signal });
      if (token !== generation || run !== getRuntime() || scope !== scopeKey(run.context)) return;
      if (!Array.isArray(payload.matches)) throw new Error("Video archive returned an invalid response.");
      if (payload.nextCursor) cursors[page + 1] = payload.nextCursor;
      else cursors.length = page + 1;
      update({ matches: payload.matches, page, cursors, queryKey, status: "ready", error: "", hasMore: Boolean(payload.nextCursor) });
    } catch (error) {
      if (token !== generation || run !== getRuntime() || scope !== scopeKey(run.context)) return;
      update({ matches: [], page, cursors, queryKey, status: "error", error: error.message || "Could not search video archive.", hasMore: false });
    } finally {
      if (token === generation) request = null;
    }
  }

  function filtersChanged(field) {
    bind();
    cancel();
    const run = getRuntime();
    if (!run) return;
    if (!hasSearch(queryFor(run.store.getState())) || !shouldLoadMetadata(run.context, run.store.getState())) {
      update(null);
      return;
    }
    update({ matches: [], page: 0, cursors: [null], status: "loading", error: "", hasMore: false });
    // A single debounce per user edit, never a recurring refresh.
    debounce = setTimeout(() => { debounce = null; void load(); }, field === "search" ? 250 : 0);
  }

  function handlePage(button) {
    if (!button || button.disabled) return false;
    const page = Number(button.dataset.videoAnalysisArchivePage);
    const archive = getRuntime()?.store.getState().library?.archive;
    if (!archive || archive.status !== "ready" || !Number.isInteger(page) || page < 0 || (page > 0 && !archive.cursors?.[page])) return false;
    void load({ page }).then(() => {
      getRuntime()?.context?.ui?.analysisRoomWorkspace?.querySelector("[data-video-analysis-archive-results-title]")?.focus({ preventScroll: true });
    });
    return true;
  }

  function dispose() {
    cancel();
    unsubscribe?.();
    unsubscribe = null;
  }

  return { bind, load, filtersChanged, handlePage, dispose };
}
