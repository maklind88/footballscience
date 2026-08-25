const SYSTEM_ENV_KEYS = Object.freeze([
  "CI",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "TZ",
]);

export const leaderboardStagingForbiddenChildEnvKeys = Object.freeze([
  "APP_STATE_BACKUP_STATUS_TOKEN",
  "CRON_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "LIVE_QA_PASSWORD",
  "LIVE_QA_PEER_PASSWORD",
  "LIVE_QA_PEER_USERNAME",
  "LIVE_QA_USERNAME",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PGPASSWORD",
  "PGDATABASE",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STAGING_QA_PASSWORD",
  "STAGING_QA_USERNAME",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_TOKEN",
]);

export function isExpectedSupabaseProjectUrl(value, projectRef) {
  try {
    const url = new URL(String(value || ""));
    const expectedOrigin = `https://${projectRef}.supabase.co`;
    return url.protocol === "https:"
      && url.hostname === `${projectRef}.supabase.co`
      && url.origin === expectedOrigin
      && url.username === ""
      && url.password === ""
      && (url.pathname === "/" || url.pathname === "")
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

function copyDefined(target, source, key) {
  if (source[key] !== undefined && source[key] !== null && String(source[key]) !== "") {
    target[key] = String(source[key]);
  }
}

export function buildLeaderboardStagingChildEnv(sourceEnv = {}, resolved = {}) {
  const childEnv = {};
  SYSTEM_ENV_KEYS.forEach((key) => copyDefined(childEnv, sourceEnv, key));
  Object.assign(childEnv, {
    PLAYWRIGHT_BASE_URL: resolved.baseUrl,
    STAGING_QA_BASE_URL: resolved.baseUrl,
    LIVE_QA_BASE_URL: resolved.productionBaseUrl,
    STAGING_SUPABASE_PROJECT_REF: resolved.stagingRef,
    SUPABASE_PROJECT_REF: resolved.productionRef,
    LEADERBOARD_STAGING_QA_TEAM_ID: resolved.teamId,
    LEADERBOARD_STAGING_QA_USERNAME: resolved.username,
    LEADERBOARD_STAGING_QA_PASSWORD: resolved.password,
  });
  leaderboardStagingForbiddenChildEnvKeys.forEach((key) => delete childEnv[key]);
  return childEnv;
}
