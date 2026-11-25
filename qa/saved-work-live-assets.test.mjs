import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { assertBuild, assetOrigin, productionOrigin, selectSavedWorkStaticFiles,
  startSavedWorkAssetMirror, verifySavedWorkProductionIdentity } from '../scripts/lib/saved-work-live-assets.mjs';
import { assertSavedWorkLoopback, guardSavedWorkLoopback, savedWorkIsolationProxy } from './helpers/saved-work-loopback-browser.mjs';

const build = '1'.repeat(40);
const deployment = 'https://footballscience-candidate123-makattack.vercel.app';
const backend = 'https://bustidorxevacosqhkcz.supabase.co';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('the verifier accepts only an exact build and known HTTPS deployment origin', () => {
  assert.equal(assertBuild(build), build);
  for (const invalid of [undefined, 'main', build.slice(0, 39), 'g'.repeat(40)]) {
    assert.throws(() => assertBuild(invalid), /40-character/);
  }
  assert.equal(assetOrigin(), productionOrigin);
  assert.equal(assetOrigin(deployment + '/'), deployment);
  for (const invalid of [deployment + '/api/app-state', `${deployment}:443`, `${deployment}/?query=1`,
    deployment.replace('https:', 'http:'), deployment.replace('https://', 'https://user@'),
    deployment + '.unrelated.test']) {
    assert.throws(() => assetOrigin(invalid), /immutable footballscience/);
  }
});

test('canonical and optional immutable deployment expose the expected public build identity', async () => {
  const requestedOrigins = [];
  const fetchImpl = (url, options) => {
    assert.equal(url.pathname, '/api/client-config');
    assert.equal(url.searchParams.get('fs-verified-build'), build);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined);
    requestedOrigins.push(url.origin);
    return Response.json({ ok: true, buildId: build, url: backend });
  };
  await verifySavedWorkProductionIdentity({ expectedBuild: build, upstream: deployment, fetchImpl });
  assert.deepEqual(requestedOrigins, [productionOrigin, deployment]);
  const invalidBuild = url => Response.json({ ok: true, buildId: url.origin === deployment ? '2'.repeat(40) : build, url: backend });
  const invalidBackend = () => Response.json({ ok: true, buildId: build, url: 'https://unrelated.test' });
  for (const rejectFetch of [invalidBuild, invalidBackend]) {
    await assert.rejects(verifySavedWorkProductionIdentity({ expectedBuild: build, upstream: deployment, fetchImpl: rejectFetch }), /differs from expected/);
  }
});

test('deployment ID mode requires an immutable origin and the same reviewed ID at both endpoints', async () => {
  const deploymentId = 'dpl_1234567890ReviewedDeployment';
  const valid = () => Response.json({ ok: true, buildId: deploymentId, url: backend });
  await verifySavedWorkProductionIdentity({ expectedBuild: build, upstream: deployment, deploymentId, fetchImpl: valid });
  await assert.rejects(verifySavedWorkProductionIdentity({ expectedBuild: build, deploymentId, fetchImpl: valid }), /requires the matching immutable/);
  for (const changedOrigin of [productionOrigin, deployment]) {
    const different = url => Response.json({ ok: true, url: backend,
      buildId: url.origin === changedOrigin ? 'dpl_1234567890DifferentPart' : deploymentId });
    await assert.rejects(verifySavedWorkProductionIdentity({ expectedBuild: build, upstream: deployment, deploymentId,
      fetchImpl: different }), /differs from expected/);
  }
});

test('the public static file catalogue excludes API handlers, symlinks and tool configuration', () => {
  const entry = (mode, path) => `${mode} blob ${build}\t${path}\0`;
  const tree = [entry('100644', 'index.html'), entry('100644', 'src/core/app.mjs'), entry('100755', 'assets/image.svg'),
    entry('120000', 'assets/redirect.js'), entry('100644', 'api/app-state.js'), entry('100644', 'qa/probe.js'),
    entry('100644', 'assets/.env.js'), entry('100644', 'scripts/tool.mjs'), entry('100644', 'package.json'),
    entry('100644', 'src/core/not-a-static-asset.md')].join('');
  assert.deepEqual([...selectSavedWorkStaticFiles(tree).keys()], ['index.html', 'src/core/app.mjs', 'assets/image.svg']);
});

test('the mirror relays no browser headers or queries, blocks dynamic requests and fails closed on byte mismatch', async () => {
  const requests = [];
  const bytes = Buffer.from('<html>local test</html>');
  const mirror = await startSavedWorkAssetMirror({ expectedBuild: build,
    files: new Map([['index.html', build], ['src/altered.mjs', build]]), readBlob: () => bytes,
    fetchImpl: (url, options) => {
      assert.equal(url.origin, productionOrigin);
      assert.equal(options.method, 'GET');
      assert.equal(options.headers, undefined);
      assert.equal(url.search, `?fs-verified-build=${build}`);
      requests.push(url.pathname);
      return new Response(url.pathname === '/' ? bytes : 'different bytes');
    },
  });
  try {
    const headers = { Authorization: 'Bearer synthetic-auth', Cookie: 'synthetic=cookie' };
    for (const path of ['/?workspace=medical&private=synthetic', '/index.html']) {
      const response = await fetch(mirror.origin + path, { headers });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'self'/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    for (const [path, method] of [['/api/app-state', 'GET'], ['/index.html', 'POST'], ['/src/untracked.mjs', 'GET']]) {
      assert.equal((await fetch(mirror.origin + path, { method, headers })).status, 404);
    }
    assert.equal((await fetch(mirror.origin + '/src/altered.mjs')).status, 502);
    await new Promise((resolve, reject) => {
      const socket = connect({ host: '127.0.0.1', port: Number(new URL(mirror.origin).port) });
      socket.once('connect', () => socket.write('CONNECT footballscience.xyz:443 HTTP/1.1\r\nHost: footballscience.xyz\r\n\r\n'));
      socket.once('error', reject);
      socket.once('close', resolve);
    });
    assert.deepEqual(requests, ['/', '/src/altered.mjs']);
    assert.deepEqual(mirror.evidence(), {
      trackedFilesVerified: { 'index.html': hash(bytes) },
      filesWithVerificationFailure: ['src/altered.mjs'],
      blockedLocalRequests: 4,
    });
  } finally {
    await mirror.close();
  }
});

test('the browser guard permits only the selected loopback HTTP origin and declines websocket connections', async () => {
  const origin = 'http://127.0.0.1:1234';
  assert.deepEqual(savedWorkIsolationProxy(origin), { server: origin, bypass: '127.0.0.1' });
  for (const invalid of ['http://localhost:1234', 'http://127.0.0.1', 'https://127.0.0.1:1234', `${origin}/extra`]) {
    assert.throws(() => assertSavedWorkLoopback(invalid), /loopback/);
  }
  let httpHandler, websocketHandler;
  await guardSavedWorkLoopback({
    route: (_, cb) => { httpHandler = cb; },
    routeWebSocket: (_, cb) => { websocketHandler = cb; },
  }, origin);
  const observed = [];
  for (const target of [origin + '/test', 'http://127.0.0.1:4321/test', productionOrigin + '/api/app-state']) {
    await httpHandler({ request: () => ({ url: () => target }), continue: () => observed.push('continue'),
      abort: reason => observed.push(reason) });
  }
  await websocketHandler({ close: ({ code }) => observed.push(code) });
  assert.deepEqual(observed, ['continue', 'blockedbyclient', 'blockedbyclient', 1008]);
});
