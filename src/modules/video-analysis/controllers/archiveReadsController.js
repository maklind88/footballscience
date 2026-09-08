const REFRESH_MS = 60_000;
const SEARCH_DELAY_MS = 250;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function queryFor(state) {
  const filters = state.library?.filters || {};
  return { search: String(filters.search || '').trim(), date: filters.date || '', type: filters.type || 'all', month: filters.calendarMonth || currentMonth() };
}

function hasSearch(query) {
  return Boolean(query.search || query.date || query.type !== 'all');
}

function scopeKey(context = {}) {
  const actor = context.currentUser || {};
  return JSON.stringify([actor.id, actor.clubId || actor.organizationId, actor.teamId]);
}

export function createArchiveReadsController({ getRuntime, scheduleCandidates }) {
  let request = null;
  let generation = 0;
  let timer = null;
  let debounce = null;
  let lastSuccess = 0;
  let failures = 0;
  let boundScope = '';
  let boundWindow = null;
  let unsubscribe = null;
  let lastQuery = '';
  let previousView = '';

  const run = () => getRuntime?.();
  const win = () => run()?.context?.win || globalThis.window;
  const update = (patch) => run()?.store.update((state) => ({ ...state, library: { ...state.library, ...patch } }));

  function active() {
    const runtime = run();
    const root = runtime?.context?.ui?.analysisRoomWorkspace;
    return runtime?.store.getState().view === 'library'
      && win()?.document?.visibilityState !== 'hidden'
      && win()?.navigator?.onLine !== false
      && (!root || root.getClientRects().length > 0);
  }

  function cancel() {
    generation += 1;
    if (request) lastSuccess = 0;
    request?.abort();
    request = null;
    clearTimeout(timer);
    clearTimeout(debounce);
    timer = null;
    debounce = null;
  }

  function schedule() {
    clearTimeout(timer);
    if (!active()) return;
    const delay = Math.min(300_000, REFRESH_MS * 2 ** Math.min(failures, 3));
    timer = setTimeout(() => {
      const focused = win()?.document?.activeElement;
      if (focused?.matches?.('[data-video-analysis-link-schedule], [data-video-analysis-link-date], [data-video-analysis-link-type]')) {
        schedule();
        return;
      }
      if (active()) void load();
    }, delay);
  }

  async function load({ resetPage = false } = {}) {
    const runtime = run();
    if (!runtime?.videos.archiveCalendar) return;
    if (!active()) { update({ remote: true }); return; }
    cancel();
    const token = generation;
    request = new AbortController();
    const signal = request.signal;
    const state = runtime.store.getState();
    const query = queryFor(state);
    const key = JSON.stringify(query);
    const old = state.library?.archive || {};
    const page = resetPage || key !== lastQuery ? 0 : old.page || 0;
    const cursors = page === 0 ? [null] : old.cursors || [null];
    lastQuery = key;
    update({ remote: true, status: 'loading', error: '', archive: { ...old, page, cursors, status: 'loading', error: '' } });
    const results = await Promise.allSettled([
      runtime.videos.archiveCalendar(query, { signal }),
      hasSearch(query) ? runtime.videos.searchArchive({ ...query, cursor: cursors[page], limit: 8 }, { signal }) : Promise.resolve({ matches: [], hasMore: false }),
    ]);
    if (token !== generation || runtime !== run()) return;
    request = null;
    const [calendar, archive] = results;
    const calendarPayload = calendar.status === 'fulfilled' ? calendar.value : null;
    const archivePayload = archive.status === 'fulfilled' ? archive.value : null;
    const error = calendar.status === 'rejected' ? calendar.reason.message : archive.status === 'rejected' ? archive.reason.message : '';
    if (!error) { lastSuccess = Date.now(); failures = 0; } else { failures += 1; }
    const nextCursors = [...cursors];
    if (archivePayload?.nextCursor) nextCursors[page + 1] = archivePayload.nextCursor;
    else nextCursors.length = page + 1;
    const current = runtime.store.getState().library || {};
    const patch = {
      status: error ? 'error' : 'ready', error, checkedAt: error ? current.checkedAt : new Date(lastSuccess).toISOString(),
      scheduleCandidates: scheduleCandidates(runtime.context),
      archive: { ...current.archive, ...(archivePayload || {}), page, cursors: nextCursors,
        status: archivePayload ? 'ready' : 'error', error: archive.status === 'rejected' ? archive.reason.message : '' },
    };
    if (calendarPayload) {
      patch.calendar = calendarPayload;
      patch.matches = calendarPayload.days.flatMap((day) => day.matches || []);
    }
    update(patch);
    schedule();
  }

  function filtersChanged(field) {
    if (!run()?.videos.archiveCalendar) return;
    cancel();
    lastQuery = '';
    update({ remote: true, status: 'loading', error: '', matches: [], calendar: { days: [] },
      archive: { matches: [], page: 0, cursors: [null], status: 'loading' } });
    debounce = setTimeout(() => { debounce = null; void load({ resetPage: true }); }, field === 'search' ? SEARCH_DELAY_MS : 0);
  }

  function wake() {
    if (!active()) { cancel(); return; }
    if ((Date.now() - lastSuccess >= REFRESH_MS || run()?.store.getState().library?.status === 'loading') && !request && !debounce) void load();
    else schedule();
  }

  function bind() {
    const runtime = run();
    const target = win();
    if (!runtime || !target) return;
    const scope = scopeKey(runtime.context);
    if (boundScope && boundScope !== scope) {
      cancel();
      lastSuccess = 0;
      lastQuery = '';
      update({ matches: [], scheduleCandidates: [], calendar: { days: [] }, archive: { matches: [], page: 0, cursors: [null] }, error: '', checkedAt: '' });
    }
    boundScope = scope;
    if (!boundWindow) {
      boundWindow = target;
      target.addEventListener('focus', wake);
      target.addEventListener('online', wake);
      target.addEventListener('offline', wake);
      target.document?.addEventListener('visibilitychange', wake);
      previousView = runtime.store.getState().view;
      unsubscribe = runtime.store.subscribe((state) => {
        const entered = state.view === 'library' && previousView !== 'library';
        previousView = state.view;
        if (state.view !== 'library') cancel();
        else if (entered && state.library?.remote) queueMicrotask(() => { if (active()) void load(); });
      });
    }
    if (runtime.store.getState().library?.remote) wake();
  }

  function handlePage(button) {
    if (!button || button.disabled) return false;
    const page = Number(button.dataset.videoAnalysisArchivePage);
    const archive = run().store.getState().library?.archive || {};
    if (!Number.isInteger(page) || page < 0 || (page > 0 && !archive.cursors?.[page])) return false;
    update({ archive: { ...archive, page } });
    void load().then(() => {
      run()?.context?.ui?.analysisRoomWorkspace?.querySelector('[data-video-analysis-archive-results-title]')?.focus({ preventScroll: true });
    });
    return true;
  }

  function dispose() {
    cancel();
    unsubscribe?.();
    boundWindow?.removeEventListener('focus', wake);
    boundWindow?.removeEventListener('online', wake);
    boundWindow?.removeEventListener('offline', wake);
    boundWindow?.document?.removeEventListener('visibilitychange', wake);
    boundWindow = null;
  }

  return { load, filtersChanged, bind, dispose, handlePage };
}
