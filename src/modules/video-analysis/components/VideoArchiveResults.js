import { normalizeLibraryMatch } from '../services/videoLibraryService.js';
import { escapeHtml } from './renderHelpers.js';

export function renderVideoArchiveResults(state, renderRow) {
  const archive = state.library?.archive || {};
  const items = (archive.matches || []).map(normalizeLibraryMatch);
  const page = archive.page || 0;
  const loading = archive.status === 'loading';
  if (!items.length && !loading && !archive.error) return '';
  return `<section class="video-analysis-library-archive" aria-label="Video archive results" aria-busy="${loading}">
    <div class="video-analysis-panel-title">
      <h3 tabindex="-1" data-video-analysis-archive-results-title>Videos</h3>
      <span>${items.length ? `${page * 8 + 1}-${page * 8 + items.length}${archive.hasMore ? '+' : ''}` : ''}</span>
    </div>
    ${archive.error ? `<p class="video-analysis-muted">${escapeHtml(archive.error)}</p>` : ''}
    <div class="video-analysis-library__list">${items.map((item) => renderRow(item, state)).join('')}</div>
    ${page || archive.hasMore ? `<nav class="video-analysis-library-pagination" aria-label="Video archive pages">
      <button type="button" data-video-analysis-archive-page="${page - 1}" aria-label="Previous videos" title="Previous videos" ${page === 0 || loading ? 'disabled' : ''}>&#8249;</button>
      <span role="status">${page + 1}</span>
      <button type="button" data-video-analysis-archive-page="${page + 1}" aria-label="Next videos" title="Next videos" ${!archive.hasMore || loading ? 'disabled' : ''}>&#8250;</button>
    </nav>` : ''}
  </section>`;
}
