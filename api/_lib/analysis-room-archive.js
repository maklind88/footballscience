const { dbRequest, normalizeUuid } = require('./video-analysis-database-core.js');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function isoDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) invalid('A valid calendar month is required.');
  const start = isoDate(`${month}-01`);
  if (!start) invalid('Invalid calendar month.');
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return [start, next.toISOString().slice(0, 10)];
}

function searchDateRange(search) {
  if (isoDate(search)) return [search, search];
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(search);
  if (slashDate) {
    const date = isoDate(`${slashDate[3]}-${slashDate[2].padStart(2, '0')}-${slashDate[1].padStart(2, '0')}`);
    if (date) return [date, date];
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(search)) return monthRange(search);
  return null;
}

function normalizeArchiveQuery(query = {}, mode = 'search') {
  const search = String(query.search || '').trim().replace(/\s+/g, ' ');
  if (search.length > 120) invalid('Search is limited to 120 characters.');
  const type = String(query.type || 'all');
  if (!['all', 'match', 'training'].includes(type)) invalid('Invalid video type.');
  let [from, to] = mode === 'calendar' ? monthRange(String(query.month || '')) : [null, null];
  const narrow = (range) => {
    from = from && from > range[0] ? from : range[0];
    to = to && to < range[1] ? to : range[1];
  };
  if (query.date) {
    const date = isoDate(query.date);
    if (!date) invalid('Invalid date filter.');
    narrow([date, date]);
  }
  const dateRange = searchDateRange(search);
  if (dateRange) narrow(dateRange);
  let cursorDate = null;
  let cursorId = null;
  if (query.cursor) {
    try {
      if (String(query.cursor).length > 200) invalid('Invalid archive cursor.');
      const cursor = JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString('utf8'));
      cursorDate = isoDate(cursor.date);
      cursorId = normalizeUuid(cursor.id);
      if (!cursorDate || !cursorId) invalid('Invalid archive cursor.');
    } catch { invalid('Invalid archive cursor.'); }
  }
  const limit = query.limit == null ? 8 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid('Page size must be between 1 and 50.');
  return {
    p_mode: mode, p_search: dateRange ? '' : search, p_type: type,
    p_date_from: from, p_date_to: to, p_cursor_date: cursorDate, p_cursor_id: cursorId, p_limit: limit,
  };
}

async function readAnalysisRoomArchive(query, actor, mode = 'search') {
  // Do not inherit the legacy demo-tenant fallback for a new archive read surface.
  const organizationId = String(actor.clubId || actor.organizationId || '').trim();
  const teamId = String(actor.teamId || '').trim();
  if (!organizationId || !teamId) return { ok: false, status: 403, reason: 'An active team is required.' };
  const params = normalizeArchiveQuery(query, mode);
  let payload;
  if (params.p_date_from && params.p_date_to && params.p_date_from > params.p_date_to) {
    payload = mode === 'calendar' ? { days: [], linkedScheduleIds: [] } : { matches: [], hasMore: false };
  } else {
    let result;
    try {
      result = await dbRequest('/rpc/video_library_archive', {
        method: 'POST', body: { ...params, p_organization_id: organizationId, p_team_id: teamId, p_actor_id: actor.id || '' },
      });
    } catch {
      result = { ok: false };
    }
    if (!result.ok) return { ok: false, status: 503, reason: 'Video archive is unavailable. Please retry.' };
    payload = result.payload;
  }
  if (!payload || (mode === 'calendar' ? !Array.isArray(payload.days) : !Array.isArray(payload.matches))) {
    return { ok: false, status: 503, reason: 'Video archive returned an invalid response.' };
  }
  const last = payload.matches?.at(-1);
  const nextCursor = payload.hasMore && last ? Buffer.from(JSON.stringify({ date: last.match_date || '0001-01-01', id: last.id })).toString('base64url') : null;
  return { ok: true, payload: { schema: 'footballscience-analysis-room-archive-v1', ...payload, nextCursor, checkedAt: new Date().toISOString() } };
}

module.exports = { normalizeArchiveQuery, readAnalysisRoomArchive };
