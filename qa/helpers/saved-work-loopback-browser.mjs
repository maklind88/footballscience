export function assertSavedWorkLoopback(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.href !== `${url.origin}/`) {
    throw new Error('Saved work probes require an exact HTTP loopback origin');
  }
  return url.origin;
}

export function savedWorkIsolationProxy(origin) {
  return { server: assertSavedWorkLoopback(origin), bypass: '127.0.0.1' };
}

export async function guardSavedWorkLoopback(context, baseURL) {
  const origin = assertSavedWorkLoopback(baseURL);
  // Explicit page routes may fulfill synthetic auth or send app-state to the
  // test's separate loopback API. Everything else stays on the app mirror.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*', socket => socket.close({ code: 1008, reason: 'Saved work probe is isolated' }));
}
