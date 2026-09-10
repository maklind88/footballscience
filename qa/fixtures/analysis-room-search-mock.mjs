import { filterVideoLibraryItems, normalizeLibraryMatch } from "../../src/modules/video-analysis/services/videoLibraryService.js";

export function archiveSearchFixture(matches, params) {
  const rows = filterVideoLibraryItems(matches.map(normalizeLibraryMatch), Object.fromEntries(params))
    .map((item) => item.match)
    .sort((a, b) => String(b.match_date || "0001-01-01").localeCompare(a.match_date || "0001-01-01") || b.id.localeCompare(a.id));
  const offset = Number(params.get("cursor") || 0);
  const limit = Number(params.get("limit") || 8);
  const hasMore = rows.length > offset + limit;
  return { matches: rows.slice(offset, offset + limit), hasMore, nextCursor: hasMore ? String(offset + limit) : null };
}
