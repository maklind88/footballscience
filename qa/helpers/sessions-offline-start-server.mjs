import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSessionsOfflinePackage } from '../../scripts/build-sessions-offline-package.mjs';
import { qaCoach } from './set-pieces-central-fixture.mjs';
import { installSessionStorageFixture } from './session-full-app-storage-fixture.mjs';

const require = createRequire(import.meta.url);
const { issueSessionsOfflineGrant } = require('../../api/_lib/sessions-offline-grant.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const trustPath = '/src/core/sessions-offline-access/trust.mjs';
const shellPath = '/sessions-offline-shell.html';
const mime = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
};

export const qaLoginKey = 'sb-qa-offline-start-auth-token';
export const qaGrantRequest = request => {
  const url = new URL(request);
  return url.pathname === '/api/app-state' && url.searchParams.get('sessionOfflineGrant') === '1';
};

export async function startSessionsOfflineStartFixture() {
  const actor = { id: qaCoach.id };
  const membership = {
    organizationId: 'set-pieces-org', clubId: 'club-ncc', teamId: 'team-ncc-first', role: 'admin',
    status: 'active', acceptedAt: '2026-01-01', organization: { status: 'active' },
    club: { status: 'active' }, team: { status: 'active' },
  };
  const tokenClaims = Buffer.from(JSON.stringify({ sub: actor.id, exp: Math.floor(Date.now() / 1000) + 7200 })).toString('base64url');
  const token = `qa.${tokenClaims}.synthetic-offline-start`;
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keys = { 'qa-local': publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
  const trustBytes = Buffer.from(`export const trustedSessionsOfflineKeys = Object.freeze(${JSON.stringify(keys)});\n`);
  const overrides = new Map([[trustPath, trustBytes]]);
  let built = await buildSessionsOfflinePackage({ overrides });
  const state = { grantAttempts: 0, grantAccepted: 0, denied: false, corruptAsset: '', disconnectSessionNavigation: false, privateRequests: 0, grantLifetimeMs: undefined };
  let origin;
  let closed = false;
  const onlineRoutes = new Map();

  function send(res, status, contentType, body) {
    res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (state.disconnectSessionNavigation && url.pathname === '/' &&
          url.searchParams.get('workspace') === 'session-planner') {
        req.socket.destroy();
        return;
      }
      if (req.method === 'GET' && qaGrantRequest(url.href)) {
        state.grantAttempts++;
        const result = await issueSessionsOfflineGrant({
          authorization: req.headers.authorization, owner: url.searchParams.get('owner'), date: url.searchParams.get('date'),
        }, {
          keys, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), origin,
          now: state.grantLifetimeMs === undefined ? Date.now() : Date.now() - 3600000 + state.grantLifetimeMs,
          readActor: async authorization => authorization === `Bearer ${token}` ? actor : null,
          resolveIdentity: async () => ({
            ok: true, actor: { ...actor, status: 'active', profile: { status: 'active' } },
            scope: { memberships: [membership] },
          }),
          canRead: async () => !state.denied,
        });
        if (result.ok) {
          state.grantAccepted++;
          state.expiresAt = JSON.parse(result.grant.content).expiresAt;
        }
        send(res, result.ok ? 200 : result.status, 'application/json', JSON.stringify(result));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        state.privateRequests++;
        const handle = onlineRoutes.get(url.pathname);
        if (!handle || !['GET', 'POST'].includes(req.method)) {
          send(res, 404, 'application/json', '{"ok":false}');
          return;
        }
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 1024 * 1024) {
            send(res, 413, 'application/json', '{"ok":false}');
            return;
          }
          chunks.push(chunk);
        }
        const body = length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
        await handle({
          request: () => ({ url: () => url.href, method: () => req.method, postDataJSON: () => body }),
          fulfill: ({ status = 200, json }) => send(res, status, 'application/json', JSON.stringify(json)),
        });
        return;
      }
      if (req.method !== 'GET') {
        state.privateRequests++;
        send(res, 405, 'text/plain', 'Synthetic test origin is read only');
        return;
      }
      if (url.pathname === '/qa-sessions-offline-probe') {
        send(res, 200, 'text/html', '<!doctype html><title>Isolated Sessions test</title>');
        return;
      }
      if (url.pathname === '/sessions-offline-package.json') {
        send(res, 200, 'application/json', JSON.stringify(built.manifest));
        return;
      }
      const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      if (!/^\/[\w./-]+$/.test(pathname) || pathname.includes('..') || pathname.includes('/.') ||
          (!/^\/[^/]+$/.test(pathname) && !/^\/(?:src|assets)\//.test(pathname)) || !Object.hasOwn(mime, extname(pathname))) {
        send(res, 404, 'text/plain', 'Not found');
        return;
      }
      const body = pathname === state.corruptAsset ? Buffer.from('Synthetic integrity mismatch') :
        built.files.get(pathname) ?? await readFile(root + pathname.slice(1));
      send(res, 200, mime[extname(pathname)] || 'application/octet-stream', body);
    } catch {
      send(res, 404, 'text/plain', 'Synthetic fixture unavailable');
    }
  });
  async function listen(port) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  }
  await listen(0);
  const port = server.address().port;
  origin = `http://127.0.0.1:${port}`;

  return {
    origin, token, state,
    packageId: () => built.packageId,
    async offerNextVersion(extraCode = new Map()) {
      const modified = Buffer.concat([built.files.get(shellPath), Buffer.from('\n<!-- synthetic next build -->')]);
      built = await buildSessionsOfflinePackage({ overrides: new Map([...overrides, [shellPath, modified], ...extraCode]) });
      return built.packageId;
    },
    async resume(previous) {
      if (!closed) throw new Error('Synthetic origin is already running');
      // Rebind the existing synthetic Sessions HTTP responses to the real
      // loopback server. WebKit can bypass page.route on worker-owned requests.
      const resumed = await installSessionStorageFixture({
        addInitScript() {},
        clock: { setFixedTime() {} },
        route(pattern, handler) {
          const [pathname] = pattern.match(/\/api\/[a-z-]+/) ?? [];
          if (pathname) onlineRoutes.set(pathname, handler);
        },
      });
      Object.assign(resumed, previous, { reject: false, writes: [...previous.writes] });
      await listen(port);
      closed = false;
      return resumed;
    },
    async stop() {
      if (closed) return;
      closed = true;
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}
