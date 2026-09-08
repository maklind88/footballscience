import { expect, test } from '@playwright/test';

async function openArchive(page) {
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.addInitScript(() => {
    window.__videoAnalysisSmokeScheduleEvents = [];
    window.__videoAnalysisSmokeMatches = Array.from({ length: 240 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, match_date: '2026-06-15',
      title: `Training ${String(i).padStart(3, '0')} with a deliberately long descriptive title`,
      metadata: { eventType: 'training' }, clip_count: 50000,
      latest_video: { id: `video-${i}` }, latest_source: { id: `source-${i}` },
    }));
    window.__videoAnalysisSmokeMatches.push({ id: '11111111-1111-4111-8111-999999999999', title: 'Historic opponent match', match_date: '2020-01-01' });
  });
  await page.goto('/qa/video-analysis-browser-smoke.html?reset=1');
  await expect(page.locator('[data-video-analysis-library]')).toHaveAttribute('aria-busy', 'false');
}

test('archive finds old videos beyond the initial window and opens them in FS Player', async ({ page }) => {
  await openArchive(page);
  await expect(page.locator('.video-analysis-calendar-event')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Show all 240 activities for 15/06/2026' })).toBeVisible();
  await page.getByRole('searchbox').fill('Historic opponent');
  await page.clock.runFor(300);
  await expect(page.getByRole('region', { name: 'Video archive results' })).toContainText('Historic opponent match');
  await expect(page.locator('.video-analysis-calendar-event')).toHaveCount(0);
  await page.locator('.video-analysis-library-row [data-video-analysis-open-library-item]').click();
  await expect(page.locator('.analysis-room-tab.is-active')).toContainText('FS Player');
  await expect(page.locator('[data-video-analysis-library]')).toHaveCount(0);
});

test('archive paginates on the server, reports exact clip counts and returns to earlier pages', async ({ page }) => {
  await openArchive(page);
  await page.getByRole('button', { name: 'Show all 240 activities for 15/06/2026' }).click();
  await page.clock.runFor(20);
  const results = page.getByRole('region', { name: 'Video archive results' });
  await expect(results.locator('.video-analysis-library-row')).toHaveCount(8);
  await expect(results.locator('.video-analysis-library-row').first()).toContainText('50000 clips');
  const firstTitle = await results.locator('strong').first().textContent();
  await page.getByRole('button', { name: 'Next videos' }).click();
  await expect(results.locator('strong').first()).not.toHaveText(firstTitle);
  await expect(results.locator('.video-analysis-library-row')).toHaveCount(8);
  await page.getByRole('button', { name: 'Previous videos' }).click();
  await expect(results.locator('strong').first()).toHaveText(firstTitle);
  const queries = await page.evaluate(() => window.__videoAnalysisRequests.filter((r) => r.action === 'library-search').map((r) => r.query));
  expect(queries.every((q) => q.limit === '8')).toBe(true);
  expect(queries.some((q) => q.cursor)).toBe(true);
});

test('archive refreshes updated metadata after one minute but pauses while hidden and in FS Player', async ({ page }) => {
  await openArchive(page);
  await page.evaluate(() => { window.__videoAnalysisSmokeMatches.at(-2).clip_count = 50001; });
  await page.clock.runFor(60_100);
  await expect(page.locator('.video-analysis-calendar-event').filter({ hasText: 'Training 239' })).toContainText('50001 clips');
  const reads = () => page.evaluate(() => window.__videoAnalysisRequests.filter((r) => r.action === 'library-calendar').length);
  const initial = await reads();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(120_000);
  expect(await reads()).toBe(initial);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(reads).toBe(initial + 1);
  await page.locator('[data-video-analysis-room-tab="fs-player"]').click();
  const inPlayer = await reads();
  await page.clock.runFor(120_000);
  expect(await reads()).toBe(inPlayer);
});

test('archive debounces typing and never replaces a newer search with a late response', async ({ page }) => {
  await openArchive(page);
  await page.evaluate(() => {
    const fetch = window.fetch;
    window.fetch = async (url, options) => {
      const query = new URL(url, location.origin).searchParams;
      const result = await fetch(url, options);
      if (query.get('search') === 'Historic') await new Promise((resolve) => setTimeout(resolve, 1000));
      return result;
    };
  });
  const search = page.getByRole('searchbox');
  await search.fill('H');
  await search.fill('His');
  await search.fill('Historic');
  await page.clock.runFor(300);
  await search.fill('Training 239');
  await page.clock.runFor(300);
  const results = page.getByRole('region', { name: 'Video archive results' });
  await expect(results).toContainText('Training 239');
  await page.clock.runFor(1200);
  await expect(results).not.toContainText('Historic');
  const searches = await page.evaluate(() => window.__videoAnalysisRequests.filter((r) => r.action === 'library-search').map((r) => r.query.search));
  expect(searches).toEqual(['Historic', 'Training 239']);
});

for (const width of [390, 768, 1440]) {
  test(`archive video results and controls fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openArchive(page);
    await page.evaluate(() => new Promise((resolve) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/styles.css'; css.onload = resolve; document.head.prepend(css);
    }));
    await page.getByRole('searchbox').fill('Training');
    await page.clock.runFor(300);
    const results = page.getByRole('region', { name: 'Video archive results' });
    await expect(results.locator('.video-analysis-library-row')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await results.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`archive-${width}.png`), fullPage: true });
  });
}
