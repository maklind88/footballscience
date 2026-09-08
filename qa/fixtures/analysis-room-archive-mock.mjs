import { filterVideoLibraryItems, normalizeLibraryMatch } from '../../src/modules/video-analysis/services/videoLibraryService.js';

export function archiveFixturePayload(matches, params, calendar) {
  const filters = Object.fromEntries(params);
  let rows = filterVideoLibraryItems(matches.map(normalizeLibraryMatch), filters).map((item) => item.match);
  rows.sort((a, b) => String(b.match_date || '0001-01-01').localeCompare(a.match_date || '0001-01-01') || b.id.localeCompare(a.id));
  if (!calendar) {
    const offset = Number(params.get('cursor') || 0);
    const limit = Number(params.get('limit') || 8);
    const hasMore = rows.length > offset + limit;
    return { matches: rows.slice(offset, offset + limit), hasMore, nextCursor: hasMore ? String(offset + limit) : null };
  }
  rows = rows.filter((row) => row.match_date?.startsWith(params.get('month')));
  const days = new Map();
  rows.forEach((row) => {
    const day = days.get(row.match_date) || { date: row.match_date, count: 0, matches: [] };
    day.count += 1;
    if (day.matches.length < 2) day.matches.push(row);
    days.set(row.match_date, day);
  });
  return { days: [...days.values()], linkedScheduleIds: matches.filter((row) => row.match_date?.startsWith(params.get('month')))
    .map(normalizeLibraryMatch).map((item) => item.scheduleEventId).filter(Boolean) };
}
