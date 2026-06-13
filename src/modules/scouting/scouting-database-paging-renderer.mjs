function escapeMarkup(deps = {}, value = "") {
  if (typeof deps.escapeHtml === "function") {
    return deps.escapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePageNumber(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

export function createScoutingDatabasePagingRenderer(deps = {}) {
  function getPageSize(paging = {}) {
    return Math.max(1, normalizePageNumber(paging.limit, deps.pageSize || 50));
  }

  function getStateFilters() {
    const state = deps.ensureState?.() || {};
    return typeof deps.normalizeDatabaseFilters === "function" ? deps.normalizeDatabaseFilters(state.databaseFilters || {}) : state.databaseFilters || {};
  }

  function render(paging = {}) {
    const isPaged = paging?.mode === "api" || paging?.mode === "worker";
    const isFootballScienceDb = paging?.mode === "fsdb";
    const pageSize = getPageSize(paging);
    const total = Math.max(0, normalizePageNumber(paging.total, 0));
    const returned = Math.max(0, normalizePageNumber(paging.returned, 0));
    const hasMore = isPaged || isFootballScienceDb ? Boolean(paging.hasMore) : total > pageSize;
    if (isFootballScienceDb) {
      if (!returned) {
        return "";
      }
      const filters = getStateFilters();
      const cursorStack = Array.isArray(filters.fsdbCursorStack) ? filters.fsdbCursorStack : [];
      const currentPage = Math.max(1, cursorStack.length + 1);
      const totalLabel = total ? ` of ${total.toLocaleString("en-US")}` : hasMore ? "" : ` of ${returned.toLocaleString("en-US")}`;
      return `
        <div class="scouting-database-paging" data-scouting-database-paging>
          <span>${escapeMarkup(deps, `Showing ${returned.toLocaleString("en-US")} FS DB players${totalLabel}`)}</span>
          <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
            <span>Page</span>
            <input type="number" min="1" name="page" value="${currentPage}" aria-label="Football Science DB page" title="Cursor pages can move one page at a time" disabled />
          </form>
          <div>
            <button type="button" class="scouting-secondary-button" data-scouting-page-cursor="previous" ${cursorStack.length ? "" : "disabled"}>Previous 50</button>
            <button type="button" class="scouting-primary-button" data-scouting-page-cursor="next" data-scouting-next-cursor="${escapeMarkup(deps, paging.nextCursor || "")}" ${hasMore && paging.nextCursor ? "" : "disabled"}>Next 50</button>
          </div>
        </div>
      `;
    }
    if (isPaged) {
      if (!returned) {
        return "";
      }
      const apiOffset = Math.max(0, normalizePageNumber(paging.offset, 0));
      const start = apiOffset + 1;
      const end = apiOffset + returned;
      const previousOffset = Math.max(0, apiOffset - pageSize);
      const nextOffset = Number.isFinite(Number(paging.nextOffset)) ? Number(paging.nextOffset) : apiOffset + returned;
      const currentPage = Math.floor(apiOffset / pageSize) + 1;
      const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : "";
      const totalLabel = total ? ` of ${total.toLocaleString("en-US")}` : hasMore ? "" : ` of ${end.toLocaleString("en-US")}`;
      return `
        <div class="scouting-database-paging" data-scouting-database-paging>
          <span>${escapeMarkup(deps, `Showing ${start.toLocaleString("en-US")}-${end.toLocaleString("en-US")}${totalLabel}`)}</span>
          <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
            <span>Page</span>
            <input type="number" min="1" ${totalPages ? `max="${totalPages}"` : ""} name="page" value="${currentPage}" aria-label="Jump to scouting database page" title="Type a page number and press Enter" />
            ${totalPages ? `<span>/ ${totalPages}</span>` : ""}
          </form>
          <div>
            <button type="button" class="scouting-secondary-button" data-scouting-page-offset="${previousOffset}" ${apiOffset <= 0 ? "disabled" : ""}>Previous 50</button>
            <button type="button" class="scouting-primary-button" data-scouting-page-offset="${nextOffset}" ${!hasMore ? "disabled" : ""}>Next 50</button>
          </div>
        </div>
      `;
    }
    if (!total || total <= pageSize) {
      return "";
    }
    const offset = Math.max(0, normalizePageNumber(paging.offset, 0));
    const start = Math.min(total, offset + 1);
    const end = Math.min(total, offset + pageSize);
    const previousOffset = Math.max(0, offset - pageSize);
    const nextOffset = Math.min(total - 1, offset + pageSize);
    const currentPage = Math.floor(offset / pageSize) + 1;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return `
      <div class="scouting-database-paging" data-scouting-database-paging>
        <span>${escapeMarkup(deps, `Showing ${start.toLocaleString("en-US")}-${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`)}</span>
        <form class="scouting-database-page-jump" data-scouting-page-jump-form data-scouting-page-size="${pageSize}">
          <span>Page</span>
          <input type="number" min="1" max="${totalPages}" name="page" value="${currentPage}" aria-label="Jump to scouting database page" title="Type a page number and press Enter" />
          <span>/ ${totalPages}</span>
        </form>
        <div>
          <button type="button" class="scouting-secondary-button" data-scouting-page-offset="${previousOffset}" ${currentPage <= 1 ? "disabled" : ""}>Previous 50</button>
          <button type="button" class="scouting-primary-button" data-scouting-page-offset="${nextOffset}" ${currentPage >= totalPages ? "disabled" : ""}>Next 50</button>
        </div>
      </div>
    `;
  }

  return {
    render,
  };
}
