import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export const productionOrigin = 'https://footballscience.xyz';
const productionBackend = 'https://bustidorxevacosqhkcz.supabase.co';
const mime = new Map(Object.entries({
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', css: 'text/css',
  json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png',
  webp: 'image/webp', jpeg: 'image/jpeg', jpg: 'image/jpeg', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  mp4: 'video/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', gif: 'image/gif',
}));
const publicRoots = new Set(['src', 'assets']);
const maxAssetBytes = 12 * 1024 * 1024;
const maxMirrorBytes = 128 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function assertBuild(build) {
  if (!/^[a-f0-9]{40}$/.test(build || '')) throw new Error('Exact 40-character release SHA required');
  return build;
}

export function assetOrigin(deploymentUrl) {
  if (!deploymentUrl) return productionOrigin;
  const url = new URL(deploymentUrl);
  if (!/^https:\/\/footballscience-[a-z0-9]+-makattack\.vercel\.app\/?$/.test(deploymentUrl) || url.href !== `${url.origin}/`) {
    throw new Error('Expected an immutable footballscience Vercel deployment URL');
  }
  return url.origin;
}

export function savedWorkReleaseIdentity(expectedBuild, upstream, deploymentId) {
  assertBuild(expectedBuild);
  const deploymentOrigin = upstream ? assetOrigin(upstream) : null;
  if (deploymentId && (!deploymentOrigin || !/^dpl_[A-Za-z0-9]{16,64}$/.test(deploymentId))) {
    throw new Error('Vercel deployment ID verification requires the matching immutable deployment URL');
  }
  return { deploymentOrigin, expectedIdentity: deploymentId || expectedBuild };
}

function publicAsset(path) {
  const parts = path.split('/');
  if (parts.some(part => !part || part.startsWith('.') || /[\\\x00-\x1f\x7f]/.test(part))) return false;
  if (!mime.has(path.split('.').at(-1).toLowerCase())) return false;
  if (parts.length === 1) return !['package.json', 'package-lock.json', 'vercel.json'].includes(path);
  return publicRoots.has(parts[0]);
}

export function selectSavedWorkStaticFiles(gitTree) {
  const files = new Map();
  for (const entry of gitTree.split('\0').filter(Boolean)) {
    const match = /^100(?:644|755) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(entry);
    if (match && publicAsset(match[2])) files.set(match[2], match[1]);
  }
  return files;
}

function assetPath(requestUrl) {
  if (!requestUrl?.startsWith('/') || requestUrl.startsWith('//')) return '';
  try {
    const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
    return pathname === '/' ? 'index.html' : pathname.slice(1);
  } catch { return ''; }
}

async function fetchPublic(fetchImpl, origin, path, expectedBuild) {
  const pathname = path === 'index.html' ? '/' : '/' + path.split('/').map(encodeURIComponent).join('/');
  const url = new URL(pathname, origin);
  url.searchParams.set('fs-verified-build', expectedBuild);
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || response.redirected) throw new Error('Public deployment file could not be read');
  return response;
}

export async function verifySavedWorkProductionIdentity({ expectedBuild, upstream, deploymentId, fetchImpl = fetch }) {
  const { deploymentOrigin, expectedIdentity } = savedWorkReleaseIdentity(expectedBuild, upstream, deploymentId);
  const origins = [productionOrigin, ...(deploymentOrigin ? [deploymentOrigin] : [])];
  for (const origin of origins) {
    const response = await fetchPublic(fetchImpl, origin, 'api/client-config', expectedBuild);
    const { ok, buildId, url } = await response.json();
    if (ok !== true || buildId !== expectedIdentity || ![productionBackend, productionBackend + '/'].includes(url)) {
      throw new Error('Public production build or backend differs from expected release');
    }
  }
}

async function boundedBytes(response) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > maxAssetBytes) throw new Error('Public file exceeded mirror size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

function respond(res, status, type, body) {
  const scripts = type === 'text/html' ? "'self' 'unsafe-inline' https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/" : "'self'";
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'self'; script-src ${scripts}; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
  });
  res.end(body);
}

export async function startSavedWorkAssetMirror({ expectedBuild, files, readBlob, fetchImpl = fetch }) {
  assertBuild(expectedBuild);
  const verified = new Map(), cache = new Map(), failed = new Set();
  let blockedRequests = 0, retainedBytes = 0;
  const getBytes = path => {
    if (!cache.has(path)) {
      cache.set(path, (async () => {
        const response = await fetchPublic(fetchImpl, productionOrigin, path, expectedBuild);
        const released = await boundedBytes(response);
        const expected = await readBlob(files.get(path));
        const hash = sha256(released);
        if (hash !== sha256(expected)) throw new Error('Public file differs from reviewed source');
        if (retainedBytes + released.byteLength > maxMirrorBytes) throw new Error('Mirror size limit exceeded');
        retainedBytes += released.byteLength;
        verified.set(path, hash);
        return released;
      })());
    }
    return cache.get(path);
  };
  const server = createServer(async (req, res) => {
    const path = assetPath(req.url);
    // Only a tracked, explicitly public static Git blob may produce an upstream GET.
    if (req.method !== 'GET' || !publicAsset(path) || !files.has(path)) {
      blockedRequests++;
      respond(res, 404, 'text/plain', 'Unavailable in isolated saved work probe');
      return;
    }
    try {
      const bytes = await getBytes(path);
      respond(res, 200, mime.get(path.split('.').at(-1).toLowerCase()), bytes);
    } catch {
      failed.add(path);
      if (!res.destroyed) respond(res, 502, 'text/plain', 'Public file could not be verified');
    }
  });
  function refuseTunnel(_request, socket) {
    blockedRequests++;
    socket.destroy();
  }
  server.on('connect', refuseTunnel);
  server.on('upgrade', refuseTunnel);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    evidence: () => ({ trackedFilesVerified: Object.fromEntries([...verified].sort()),
      filesWithVerificationFailure: [...failed].sort(), blockedLocalRequests: blockedRequests }),
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
