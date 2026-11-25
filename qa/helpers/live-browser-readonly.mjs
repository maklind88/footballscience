import { test as base } from '@playwright/test';

const productionOrigin = 'https://footballscience.xyz';
const productionAuth = 'https://bustidorxevacosqhkcz.supabase.co';
const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function installProductionBrowserReadGuard(context, baseURL) {
  const isProductionBrowser = Boolean(baseURL && new URL(baseURL).origin === productionOrigin);

  // Browser routes do not cover APIRequestContext. Direct API smoke requests
  // use explicit origins and keep their auth and permitted reads separate.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isProductionTarget = url.origin === productionOrigin || url.origin === productionAuth;
    if (!isProductionBrowser && !isProductionTarget) return route.fallback();
    if (url.origin === productionOrigin && url.pathname === '/api/chat' &&
        request.headers()['x-footballscience-chat-active']) return route.abort('blockedbyclient');
    if (readMethods.has(request.method())) return route.fallback();

    const auth = isProductionBrowser && request.method() === 'POST' && (
      (url.origin === productionOrigin && url.pathname === '/api/client-config') ||
      (url.origin === productionAuth && url.pathname === '/auth/v1/token')
    );
    if (!auth) return route.abort('blockedbyclient');
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) return route.abort('blockedbyclient');
    return route.fulfill({ response });
  });
  // Ignore local application state changes; do not open a browser socket to
  // production during a read probe.
  await context.routeWebSocket('**/*', socket => {
    const origin = new URL(socket.url().replace(/^ws/, 'http')).origin;
    if (isProductionBrowser || [productionOrigin, productionAuth].includes(origin)) return socket.close();
    return socket.connectToServer();
  });
}

export const test = base.extend({
  serviceWorkers: 'block',
  context: async ({ context, baseURL }, use) => {
    await installProductionBrowserReadGuard(context, baseURL);
    await use(context);
  },
});
