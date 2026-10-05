export async function readIsolationClientConfig(host, fetchImpl = fetch) {
  const url = new URL('/api/client-config', `https://${host}`);
  url.searchParams.set('isolationCheck', String(Date.now()));
  const response = await fetchImpl(url, {
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
    const error = new Error(`${host} client config is protected or redirected (${response.status}).`);
    error.code = 'CONFIG_PROTECTED';
    throw error;
  }
  if (!response.ok) throw new Error(`${host} client config failed (${response.status}).`);
  const payload = await response.json().catch(() => null);
  let configured;
  try { configured = new URL(payload?.url); } catch { /* Rejected below. */ }
  if (!configured || configured.protocol !== 'https:' || configured.username || configured.password
    || !/^[a-z0-9]{20}\.supabase\.co$/.test(configured.hostname)
    || configured.href !== `${configured.origin}/`) {
    throw new Error(`${host} returned invalid Supabase configuration.`);
  }
  return { host, supabaseUrl: configured.origin, supabaseRef: configured.hostname.split('.')[0] };
}

export function assertStagingDeploymentIdentity(deployments, projectId) {
  const { branch, staging, live } = deployments;
  for (const [label, deployment] of Object.entries(deployments)) {
    if (!deployment?.id || !projectId || (deployment.projectId || deployment.project?.id) !== projectId
      || deployment.readyState !== 'READY') {
      throw new Error(`${label} deployment is missing, not ready, or belongs to another project.`);
    }
  }
  if (branch.id !== staging.id) {
    throw new Error('Protected staging branch differs from staging domain; refusing automatic alias repair.');
  }
  if (branch.id === live.id || branch.target === 'production' || staging.target === 'production'
    || live.target !== 'production' || branch.meta?.githubCommitRef !== 'staging'
    || staging.meta?.githubCommitRef !== 'staging') {
    throw new Error('Vercel deployment metadata does not prove staging/live isolation.');
  }
  return branch.id;
}

export async function verifyProtectedStagingIdentity(hosts, env = process.env, fetchImpl = fetch) {
  const { VERCEL_TOKEN: token, VERCEL_ORG_ID: teamId, VERCEL_PROJECT_ID: projectId } = env;
  if (!token || !teamId || !projectId) {
    throw new Error('Protected staging verification requires VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID.');
  }
  const deployments = {};
  for (const [label, host] of Object.entries(hosts)) {
    const url = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(host)}`);
    url.searchParams.set('teamId', teamId);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Vercel ${label} metadata check failed (${response.status}).`);
    deployments[label] = await response.json();
  }
  return assertStagingDeploymentIdentity(deployments, projectId);
}

export async function readStagingIsolationReport(hosts, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const staging = await readIsolationClientConfig(hosts.staging, fetchImpl);
  const live = await readIsolationClientConfig(hosts.live, fetchImpl);
  let stagingBranch;
  try {
    stagingBranch = await readIsolationClientConfig(hosts.branch, fetchImpl);
  } catch (error) {
    if (error.code !== 'CONFIG_PROTECTED') throw error;
    const deploymentId = await verifyProtectedStagingIdentity(hosts, options.env || process.env, fetchImpl);
    // Inherit only after proving both staging aliases serve the exact same artifact.
    stagingBranch = { ...staging, host: hosts.branch, verifiedDeploymentId: deploymentId };
  }
  return { stagingBranch, staging, live };
}
