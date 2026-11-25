import { randomBytes, randomUUID } from 'node:crypto';
import { createIsolatedStagingProbe } from './isolated-staging-probe.mjs';

function requireProof(condition, message) {
  if (!condition) throw new Error(message);
}

export async function createStagingChatProbe({ browserOrigin, env = process.env, fetchImpl = fetch } = {}) {
  requireProof(browserOrigin && env.STAGING_QA_BASE_URL && new URL(browserOrigin).href === new URL(env.STAGING_QA_BASE_URL).href,
    'Exact staging browser origin required for Chat fixtures');
  return createIsolatedStagingProbe({ env, expectedBuild: env.CHAT_QA_EXPECTED_BUILD, fetchImpl });
}

export async function installStagingChatBrowserGuard(context, staging) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith('/api/') && url.origin !== staging.origin) return route.abort('blockedbyclient');
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
    if (method !== 'POST') return route.abort('blockedbyclient');

    const stageAuth = url.origin === staging.origin && url.pathname === '/api/client-config';
    const backendAuth = url.origin === staging.backend && url.pathname === '/auth/v1/token';
    let stageChat = false;
    if (url.origin === staging.origin && url.pathname === '/api/chat') {
      try { stageChat = ['sendMessage', 'markThreadRead'].includes(request.postDataJSON()?.action); } catch {}
    }
    if (!stageAuth && !backendAuth && !stageChat) return route.abort('blockedbyclient');

    await staging.identity();
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) return route.abort('blockedbyclient');
    return route.fulfill({ response });
  });
  await context.routeWebSocket('**/*', socket => socket.close());
}

export async function trackStagingChatPeer({ staging, token, primaryUser, fetchImpl = fetch }) {
  requireProof(token && primaryUser.id && primaryUser.role === 'admin' && primaryUser.clubId && primaryUser.teamId,
    'An authenticated staging admin with an exact club and team is required');
  const username = `qa-chat-${randomUUID()}`;
  const email = `${username}@footballscience.qa`;
  const password = `${randomBytes(24).toString('base64url')}!7a`;
  let userId = '';
  let attemptedCreate = false;

  async function users(method = 'GET', id = '', data) {
    await staging.identity();
    const url = new URL('/api/admin-users', staging.origin);
    if (id) url.searchParams.set('userId', id);
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch {
      throw new Error('Staging Chat account request transport failed');
    }
    requireProof(response.status === (method === 'POST' ? 201 : 200), `Staging Chat account request failed (${method} ${response.status})`);
    const result = await response.json().catch(() => null);
    requireProof(result?.ok === true, 'Staging Chat account request returned no confirmation');
    return result;
  }

  function owns(user) {
    return user?.id && user.id !== primaryUser.id && user.email === email && user.username === username &&
      user.role === 'coach' && user.clubId === primaryUser.clubId && user.teamId === primaryUser.teamId;
  }

  async function matchingAccounts() {
    const inventory = await users();
    requireProof(Array.isArray(inventory.users), 'Staging Chat account inventory missing');
    return inventory.users.filter(user => user.email === email || user.username === username || (userId && user.id === userId));
  }

  return {
    async create() {
      requireProof(!attemptedCreate && (await matchingAccounts()).length === 0, 'Staging Chat fixture identity already exists');
      attemptedCreate = true;
      const result = await users('POST', '', {
        email, password, username, firstName: 'Synthetic', lastName: 'Chat QA', role: 'coach', status: 'active',
        clubId: primaryUser.clubId, clubName: primaryUser.clubName, teamId: primaryUser.teamId,
        teamName: primaryUser.teamName || primaryUser.team, team: primaryUser.teamName || primaryUser.team,
      });
      requireProof(owns(result.user), 'Staging Chat fixture identity or scope mismatch');
      userId = result.user.id;
      return { id: userId, credentials: { username: email, password } };
    },
    async cleanup() {
      if (!attemptedCreate) return;
      const matches = await matchingAccounts();
      if (!matches.length) return;
      requireProof(matches.length === 1 && owns(matches[0]) && (!userId || matches[0].id === userId),
        'Staging Chat cleanup could not establish ownership of the temporary account');
      await users('DELETE', matches[0].id);
      requireProof((await matchingAccounts()).length === 0, 'Staging Chat temporary account cleanup was not confirmed');
    },
  };
}
