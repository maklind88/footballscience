import { test, expect } from '@playwright/test';
import { createDashboardChatDomainRuntime } from '../src/modules/chat/dashboard-chat-domain-runtime.mjs';
import { createDashboardJsonStorage } from '../src/core/dashboard-runtime-utils.mjs';
import { createDashboardChatWidgetRuntime } from '../src/modules/chat/dashboard-chat-widget-runtime.mjs';

const key = 'football-dashboard-chat-widget-state-v1';
const selected = 'dm:coach:peer';
function fixture() {
  let user = { id: 'coach', organizationId: 'org', teamId: 'team-1' };
  let failure = '', logs = 0;
  const values = new Map([[key, JSON.stringify({ isOpen: true, selectedThreadId: 'team' })]]);
  const storage = createDashboardJsonStorage({ windowRef: { localStorage: {
    getItem: key => values.get(key),
    setItem: (key, value) => { if (failure) throw new DOMException('Test storage unavailable', failure); values.set(key, value); },
  } }, logEvent: () => logs++ });
  const create = () => createDashboardChatDomainRuntime({ ...storage, getCurrentPlatformUser: () => user,
    createDashboardChatMessageTextRenderer: () => () => '' });
  return { runtime: create(), create, values, deny: name => { failure = name; }, logs: () => logs,
    user: next => { user = next; }, getUser: () => user };
}
for (const failure of ['QuotaExceededError', 'SecurityError']) {
  test(`Chat navigation survives ${failure} through the actual JSON storage adapter`, () => {
    const f = fixture(); f.deny(failure);
    f.runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
    expect(f.runtime.readDashboardChatWidgetState()).toEqual({ isOpen: true, selectedThreadId: selected });
    expect(JSON.parse(f.values.get(key)).selectedThreadId).toBe('team');
    expect(f.logs()).toBe(1);
    f.runtime.writeDashboardChatWidgetState({ isOpen: false, selectedThreadId: selected });
    f.runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
    expect(f.runtime.readDashboardChatWidgetState().selectedThreadId).toBe(selected);
    // A new page gets the last persisted preference, never a durability claim about memory.
    expect(f.create().readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: 'team' });
  });
}
test('Chat preference persists on success; external stale storage cannot override an active selection', () => {
  const f = fixture();
  f.runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
  expect(f.create().readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: selected });
  f.values.set(key, JSON.stringify({ selectedThreadId: 'team' }));
  const returned = f.runtime.readDashboardChatWidgetState(); returned.selectedThreadId = 'team';
  expect(f.runtime.readDashboardChatWidgetState().selectedThreadId).toBe(selected);
});
for (const field of ['id', 'organizationId', 'teamId']) {
  test(`Changing ${field} drops both in-memory selection and stale disk preference`, () => {
    const f = fixture();
    f.runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
    f.deny('QuotaExceededError');
    f.user({ ...f.getUser(), [field]: 'other' });
    expect(f.runtime.readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: 'team' });
    expect(JSON.parse(f.values.get(key)).selectedThreadId).toBe(selected);
  });
}
test('Logout render resets navigation even when the same account signs back in', () => {
  const f = fixture(); const user = f.getUser();
  f.runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
  const widget = createDashboardChatWidgetRuntime({ getCurrentPlatformUser: f.getUser,
    readDashboardChatWidgetState: f.runtime.readDashboardChatWidgetState,
    ui: { dashboardChatWidgetRoot: { dataset: {}, innerHTML: '' } } });
  f.user(null); widget.renderDashboardChatWidget(); f.user(user);
  expect(f.runtime.readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: 'team' });
});
test('A read before auth is ready does not consume the persisted preference', () => {
  const f = fixture(); const user = f.getUser();
  f.values.set(key, JSON.stringify({ selectedThreadId: selected }));
  f.user(null); expect(f.runtime.readDashboardChatWidgetState().isOpen).toBe(false);
  f.user(user); expect(f.runtime.readDashboardChatWidgetState().selectedThreadId).toBe(selected);
});
test('Throwing read/write adapters do not prevent navigation', () => {
  const runtime = createDashboardChatDomainRuntime({ getCurrentPlatformUser: () => ({ id: 'coach' }),
    createDashboardChatMessageTextRenderer: () => () => '',
    readDashboardJson: () => { throw new Error('denied'); }, writeDashboardJson: () => { throw new Error('denied'); } });
  expect(runtime.readDashboardChatWidgetState()).toEqual({ isOpen: false, selectedThreadId: 'team' });
  runtime.writeDashboardChatWidgetState({ isOpen: true, selectedThreadId: selected });
  expect(runtime.readDashboardChatWidgetState()).toEqual({ isOpen: true, selectedThreadId: selected });
});
