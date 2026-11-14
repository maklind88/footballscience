import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createDashboardChatApiRuntime } from '../src/modules/chat/dashboard-chat-api-runtime.mjs';
import { createDashboardChatApiDomainRuntime } from '../src/modules/chat/dashboard-chat-api-domain-runtime.mjs';

const team = { threadId: 'team', type: 'team' };
const direct = { threadId: 'dm:coach:peer', type: 'dm', unreadCount: 1 };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createHarness(fetchDashboardChatApi) {
  let threads = [];
  let summaryTimer = 0;
  let lastRequestedAt = 0;
  let nextTimerId = 0;
  let status = {};
  const timers = new Map();
  const renders = [];
  const runtime = createDashboardChatApiRuntime({
    fetchDashboardChatApi,
    getDashboardApiThreads: () => threads,
    setDashboardApiThreads: value => { threads = value; },
    getDashboardChatCurrentViewState: () => ({ isOpen: true, selectedThreadId: 'team' }),
    getDashboardChatApiThreadSummarySyncTimer: () => summaryTimer,
    setDashboardChatApiThreadSummarySyncTimer: value => { summaryTimer = value; },
    getDashboardChatApiThreadSummarySyncLastRequestedAt: () => lastRequestedAt,
    setDashboardChatApiThreadSummarySyncLastRequestedAt: value => { lastRequestedAt = value; },
    getDashboardChatApiStatus: () => status,
    setDashboardChatApiStatus: value => { status = value; },
    renderDashboardChatWidget: () => renders.push({ threads: structuredClone(threads), status: { ...status } }),
    win: {
      setTimeout: (callback, delay) => { timers.set(++nextTimerId, { callback, delay }); return nextTimerId; },
      clearTimeout: id => timers.delete(id),
    },
  });
  return { runtime, timers, renders, runTimers: () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach(timer => timer.callback());
  } };
}

for (const first of ['inbox', 'messages']) {
  test(`current-view refresh renders the DM inbox when ${first} arrives first`, async () => {
    const inbox = deferred();
    const messages = deferred();
    const { runtime, runTimers, renders } = createHarness(query => query.view === 'threads' ? inbox.promise : messages.promise);
    runtime.queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
    runTimers();
    const responses = {
      inbox: () => inbox.resolve({ ok: true, result: { threads: [team, direct] } }),
      messages: () => messages.resolve({ ok: true, result: { thread: team, messages: [] } }),
    };
    responses[first]();
    await Promise.resolve();
    responses[first === 'inbox' ? 'messages' : 'inbox']();
    await Promise.resolve();
    expect(renders.at(-1).threads).toContainEqual(direct);
  });
}

test('a late inbox failure stays visible instead of leaving a successful message-load status', async () => {
  const inbox = deferred();
  const { runtime, runTimers, renders } = createHarness(query => query.view === 'threads'
    ? inbox.promise : Promise.resolve({ ok: true, result: { thread: team, messages: [] } }));
  runtime.queueDashboardChatCurrentViewRefresh({ delayMs: 0 });
  runTimers();
  await Promise.resolve();
  inbox.resolve({ ok: false, status: 503, reason: 'Synthetic inbox failure' });
  await Promise.resolve();
  expect(renders.at(-1).status).toMatchObject({ key: 'server-error', operation: 'threads', detail: 'Synthetic inbox failure' });
});

test('forced inbox refresh reaches the server instead of reusing the settled read cache', async () => {
  let reads = 0;
  const urls = [];
  const domain = createDashboardChatApiDomainRuntime({
    chatApiReadDedupeWindowMs: 60_000,
    chatApiReadMinimumGapMs: 0,
    getCurrentPlatformUser: () => ({ id: 'coach' }),
    getPlatformAuthStore: () => ({ getAccessToken: async () => 'synthetic-token' }),
    fetchImpl: async url => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, threads: ++reads === 1 ? [team] : [team, direct] }) };
    },
    win: { setTimeout, clearTimeout },
  });
  const { runtime, renders } = createHarness(domain.fetchDashboardChatApi);
  await runtime.refreshDashboardChatThreadSummariesFromApi();
  await runtime.refreshDashboardChatThreadSummariesFromApi();
  expect(reads).toBe(1);
  await runtime.refreshDashboardChatThreadSummariesFromApi({ forceNetwork: true });
  expect(reads).toBe(2);
  expect(renders.at(-1).threads).toContainEqual(direct);
  expect(urls.every(url => !url.includes('forceNetwork'))).toBe(true);
});

for (const staleResult of [
  { ok: true, result: { threads: [team] } },
  { ok: false, status: 503, reason: 'Outdated failure' },
]) {
  test(`an older inbox ${staleResult.ok ? 'snapshot' : 'failure'} cannot replace a newer refresh`, async () => {
    const old = deferred();
    let reads = 0;
    const { runtime, renders } = createHarness(() => ++reads === 1
      ? old.promise : Promise.resolve({ ok: true, result: { threads: [team, direct] } }));
    const previous = runtime.refreshDashboardChatThreadSummariesFromApi();
    await runtime.refreshDashboardChatThreadSummariesFromApi({ forceNetwork: true });
    const renderCount = renders.length;
    old.resolve(staleResult);
    await previous;
    expect(renders.at(-1).threads).toContainEqual(direct);
    expect(renders.at(-1).status.key).toBe('ready');
    expect(renders).toHaveLength(renderCount);
  });
}

test('background inbox reads retain their budget while explicit refresh bypasses it', async () => {
  const { runtime, timers, runTimers } = createHarness(async () => ({ ok: true, result: { threads: [team] } }));
  runtime.queueDashboardChatThreadSummaryRefresh({ delayMs: 0 });
  runTimers();
  await Promise.resolve();
  expect(runtime.getThreadSummaryLastRequestedAt()).toBeGreaterThan(Date.now() - 1000);
  runtime.queueDashboardChatThreadSummaryRefresh({ delayMs: 0 });
  expect([...timers.values()][0].delay).toBeGreaterThan(14_000);
  runtime.queueDashboardChatThreadSummaryRefresh({ delayMs: 0, forceNetwork: true });
  expect([...timers.values()][0].delay).toBeGreaterThan(14_000);
  runtime.queueDashboardChatThreadSummaryRefresh({ delayMs: 0, immediate: true, forceNetwork: true });
  expect([...timers.values()][0].delay).toBe(0);
});

test('the app wires the inbox timestamp setter using the runtime dependency name', () => {
  const source = readFileSync(new URL('../app-runtime.js', import.meta.url), 'utf8');
  expect(/setDashboardChatApiThreadSummarySyncLastRequestedAt:\s*\(value = 0\) =>\s*\{\s*dashboardChatThreadSummaryLastRequestedAt = Number\(value\) \|\| 0;/.test(source)).toBe(true);
});
