import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const expectedHash = '9cc631f769787bdac5d2c8da3e29c37055060d681c8800ace51cf933b8428d9b';
const baseline = process.env.CHAT_CACHE_DIAGNOSTIC === 'before';
export async function installChatCacheDiagnostic(context) {
  if (!process.env.CHAT_CACHE_DIAGNOSTIC) return;
  await context.route('**/src/core/central-sync-runtime-service.mjs*', async route => {
    const response = await route.fetch();
    const body = await response.body();
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    console.log('[chat-cache-module]', JSON.stringify({ variant: process.env.CHAT_CACHE_DIAGNOSTIC, hash, matches: hash === expectedHash }));
    if (hash !== expectedHash) { await route.abort(); throw new Error('Live central module changed; diagnostic comparison invalid'); }
    const source = baseline ? execFileSync('git', ['show', 'afa32b726474ea0648d51a47d757da240aabc694^:src/core/central-sync-runtime-service.mjs'], { encoding: 'utf8' }) : body;
    await route.fulfill({ response, body: source });
  });
  await context.addInitScript(() => {
    const state = { writes: [], errors: [], clicks: [], appStatePosts: 0 };
    window.__chatCacheDiagnostic = state;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key !== 'football-dashboard-chat-widget-state-v1') return write.call(this, key, value);
      const record = { at: performance.now(), selected: JSON.parse(value)?.selectedThreadId, stack: new Error().stack?.split('\n').slice(2, 6) };
      state.writes.push(record); if(state.writes.length > 50) state.writes.shift();
      try { const result = write.call(this,key,value); record.ok = true; return result; }
      catch(error) { record.ok = false; record.error = error.name; throw error; }
    };
    window.addEventListener('error', e => { state.errors.push({ name:e.error?.name, message:String(e.message).slice(0,180) }); });
    document.addEventListener('click', e => {
      const button=e.target.closest?.('[data-dashboard-chat-thread]');
      if(button) state.clicks.push({thread:button.dataset.dashboardChatThread,at:performance.now()});
    },true);
    const fetch=window.fetch;
    window.fetch=function(input,init) { if(String(input).includes('/api/app-state') && init?.method==='POST')state.appStatePosts++;return fetch.apply(this,arguments); };
  });
}
export async function logChatCacheDiagnostic(page, threadId, phase) {
  if(!process.env.CHAT_CACHE_DIAGNOSTIC)return;
  const snapshot=await page.evaluate(target=>{
    const d=window.__chatCacheDiagnostic || {};
    const classify=id=>id===target?'target':id==='team'?'team':id?'other':'none';
    const buttons=[...document.querySelectorAll('[data-dashboard-chat-thread]')].filter(x=>x.dataset.dashboardChatThread===target);
    const stored=JSON.parse(localStorage.getItem('football-dashboard-chat-widget-state-v1')||'{}');
    return {stored:classify(stored.selectedThreadId),active:[...document.querySelectorAll('[data-dashboard-chat-list]')].map(x=>classify(x.dataset.dashboardChatActiveThread)),open:!!document.querySelector('.dashboard-chat-widget.is-open'),targetButtons:buttons.map(x=>({tag:x.tagName,selected:x.classList.contains('is-active'),rect:{width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}})),writes:d.writes?.map(x=>({...x,selected:classify(x.selected)})),clicks:d.clicks?.map(x=>({...x,thread:classify(x.thread)})),errors:d.errors,appStatePosts:d.appStatePosts};
  },threadId);
  console.log('[chat-cache-diagnostic]',JSON.stringify({variant:process.env.CHAT_CACHE_DIAGNOSTIC,phase,...snapshot}));
}
