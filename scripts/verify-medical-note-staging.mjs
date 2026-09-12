import { pathToFileURL } from "node:url";

const stagingRef = "pokrksgempkuraueglpu";
const supabaseOrigin = `https://${stagingRef}.supabase.co`;
const surfaces = [
  ["medical_availability_recommendations", "medical_coach_availability"],
  ["medical_availability_plans", "medical_coach_availability_plans"],
];

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function jwtClaims(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); }
  catch { throw new Error("Invalid QA token format"); }
}

// This complements the synthetic PostgreSQL row-policy tests. limit=0 checks
// HTTP authentication/column privileges without retrieving any clinical rows.
export async function verifyMedicalNoteStaging({ env = process.env, fetchImpl = fetch, report = console.log } = {}) {
  for (const name of ["STAGING_QA_BASE_URL", "STAGING_SUPABASE_PROJECT_REF", "STAGING_QA_USERNAME", "STAGING_QA_PASSWORD"]) {
    requireCheck(Boolean(env[name]?.trim()), `Missing ${name}`);
  }
  requireCheck(env.STAGING_SUPABASE_PROJECT_REF === stagingRef, "Expected canonical staging Supabase ref");
  const base = new URL(env.STAGING_QA_BASE_URL);
  requireCheck(base.protocol === "https:" && !base.username && !base.password
    && base.pathname === "/" && !base.search && !base.hash
    && !["footballscience.xyz", "www.footballscience.xyz"].includes(base.hostname), "Expected isolated staging origin");

  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, payload };
  }
  const configUrl = new URL("/api/client-config", base).href;
  const config = await request(configUrl);
  requireCheck(config.status === 200 && config.payload?.ok === true, "Staging client config unavailable");
  requireCheck(config.payload.url?.replace(/\/$/, "") === supabaseOrigin, "Staging backend mismatch; login not attempted");
  const apiKey = config.payload.anonKey;
  requireCheck(typeof apiKey === "string" && apiKey.length > 0, "Missing publishable API key");
  if (!apiKey.startsWith("sb_publishable_")) {
    const claims = jwtClaims(apiKey);
    requireCheck(claims.role === "anon" && claims.ref === stagingRef, "Expected staging public API key, never server privileges");
  }
  const login = await request(configUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.STAGING_QA_USERNAME, password: env.STAGING_QA_PASSWORD }),
  });
  requireCheck(login.status === 200 && login.payload?.session?.access_token, "Staging QA login failed");
  const token = login.payload.session.access_token;
  const claims = jwtClaims(token);
  requireCheck(claims.iss === `${supabaseOrigin}/auth/v1` && claims.role === "authenticated"
    && typeof claims.sub === "string" && claims.sub.length > 0, "QA session is not a staging authenticated principal");
  const headers = { apikey: apiKey, Authorization: `Bearer ${token}` };
  let checks = 0;
  async function read(relation, columns, expectedStatus, code, anonymous = false, schema = "public") {
    const url = new URL(`/rest/v1/${relation}`, supabaseOrigin);
    url.searchParams.set("select", columns);
    url.searchParams.set("limit", "0");
    const result = await request(url.href, {
      headers: { ...(anonymous ? { apikey: apiKey } : headers), "Accept-Profile": schema },
    });
    report(`${anonymous ? "anon" : "authenticated"} ${schema}.${relation} [${columns}] HTTP ${result.status}`);
    requireCheck(result.status === expectedStatus, `${relation} ${columns}: expected HTTP ${expectedStatus}, got ${result.status}`);
    if (expectedStatus === 200) {
      requireCheck(Array.isArray(result.payload) && result.payload.length === 0, "Zero-row probe unexpectedly returned data");
    } else {
      requireCheck(result.payload?.code === code, `${relation}: unexpected denial code`);
    }
    checks += 1;
  }
  try {
    const user = await request(`${supabaseOrigin}/auth/v1/user`, { headers });
    requireCheck(user.status === 200 && user.payload?.id === claims.sub, "QA session was not verified by Auth");
    for (const [table, view] of surfaces) {
      await read(view, "id,coach_note", 200);
      await read(table, "id", 200);
      await read(table, "coach_note", 403, "42501");
      await read(table, "internal_note", 403, "42501");
      await read(view, "id,coach_note", 401, "42501", true);
    }
    await read("medical_coach_recommendation_note", "*", 406, "PGRST106", false, "app_private");
  } finally {
    // Revoke only the session created by this probe, not other QA sessions.
    const logout = await request(`${supabaseOrigin}/auth/v1/logout?scope=local`, { method: "POST", headers });
    requireCheck(logout.status === 204, "QA session cleanup failed");
  }
  report(`Medical staging HTTP boundary: ${checks}/${checks} passed; no clinical rows fetched or changed.`);
  return { checks, clinicalRowsRead: 0, dataWrites: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyMedicalNoteStaging().catch(() => {
    // Never print a fetch/body exception that could contain a credential.
    console.error("Medical staging HTTP verification failed. Check isolated QA configuration and endpoint status evidence.");
    process.exitCode = 1;
  });
}
