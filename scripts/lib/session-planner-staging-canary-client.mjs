import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  SESSION_PLANNER_STORAGE_KEY,
  hashText,
} = require("../../api/_lib/session-planner-canary-recovery.js");
const REQUEST_TIMEOUT_MS = 45_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function requestSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson(url, options = {}, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      ...options,
      cache: "no-store",
      signal: requestSignal(),
    });
    const payload = await parseResponse(response);
    return {
      ok: response.ok,
      status: response.status,
      payload,
      reason: response.ok
        ? ""
        : normalizeText(payload?.reason || payload?.message || "Canary request failed.", 180),
    };
  } catch {
    return {
      ok: false,
      status: 503,
      payload: {},
      reason: "Canary request failed.",
    };
  }
}

function appUrl(appOrigin, pathname) {
  return new URL(pathname, `${normalizeText(appOrigin, 500).replace(/\/+$/, "")}/`);
}

function projectRefFromSupabaseUrl(value) {
  try {
    const hostname = new URL(normalizeText(value, 500)).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

export async function readSessionPlannerCanaryAppProject({
  appOrigin,
  fetchImpl = fetch,
} = {}) {
  const url = appUrl(appOrigin, "/api/client-config");
  url.searchParams.set("canaryCheck", `${Date.now()}`);
  const result = await requestJson(url, { method: "GET" }, fetchImpl);
  if (!result.ok) return result;
  const projectRef = projectRefFromSupabaseUrl(result.payload?.url);
  return projectRef
    ? { ok: true, status: result.status, projectRef }
    : {
        ok: false,
        status: 502,
        reason: "Staging app did not expose a valid Supabase project.",
      };
}

export async function loginSessionPlannerCanaryUser({
  appOrigin,
  username,
  password,
  fetchImpl = fetch,
} = {}) {
  const result = await requestJson(
    appUrl(appOrigin, "/api/client-config"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizeText(username, 180),
        password: normalizeText(password, 256),
      }),
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const accessToken = normalizeText(result.payload?.session?.access_token, 8000);
  const userId = normalizeText(result.payload?.session?.user?.id, 120).toLowerCase();
  if (!accessToken || !UUID_PATTERN.test(userId)) {
    return {
      ok: false,
      status: 502,
      reason: "Staging login did not return a valid user session.",
    };
  }
  return Object.freeze({ ok: true, status: result.status, accessToken, userId });
}

export async function readSessionPlannerCanaryState({
  appOrigin,
  accessToken,
  fetchImpl = fetch,
} = {}) {
  const url = appUrl(appOrigin, "/api/app-state");
  url.searchParams.set("fresh", "1");
  url.searchParams.set("keys", SESSION_PLANNER_STORAGE_KEY);
  const result = await requestJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${normalizeText(accessToken, 8000)}`,
        "x-footballscience-fresh-state": "1",
      },
    },
    fetchImpl
  );
  if (!result.ok) return result;
  const value = result.payload?.entries?.[SESSION_PLANNER_STORAGE_KEY];
  const metadata = result.payload?.metadata?.[SESSION_PLANNER_STORAGE_KEY] || {};
  const revision = Number(metadata.revision);
  const hash = normalizeText(metadata.hash, 64).toLowerCase();
  if (
    typeof value !== "string" ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    !HASH_PATTERN.test(hash) ||
    hashText(value) !== hash
  ) {
    return {
      ok: false,
      status: 409,
      reason: "Session Planner source checkpoint failed integrity validation.",
    };
  }
  return Object.freeze({
    ok: true,
    status: result.status,
    value,
    revision,
    hash,
  });
}

export async function writeSessionPlannerCanaryState({
  appOrigin,
  accessToken,
  value,
  baseRevision,
  baseHash,
  fetchImpl = fetch,
} = {}) {
  const result = await requestJson(
    appUrl(appOrigin, "/api/app-state"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizeText(accessToken, 8000)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: SESSION_PLANNER_STORAGE_KEY,
        value: String(value ?? ""),
        baseRevision,
        baseHash,
        metadata: {
          baseRevision,
          revision: baseRevision,
          hash: normalizeText(baseHash, 64).toLowerCase(),
        },
      }),
    },
    fetchImpl
  );
  if (!result.ok) {
    return Object.freeze({
      ok: false,
      status: result.status,
      conflict: result.status === 409,
      currentRevision: Number(result.payload?.currentRevision) || 0,
      reason: result.reason,
    });
  }
  const revision = Number(result.payload?.revision || result.payload?.metadata?.revision);
  const responseValue =
    typeof result.payload?.value === "string" ? result.payload.value : String(value ?? "");
  const hash = normalizeText(
    result.payload?.hash || result.payload?.metadata?.hash || hashText(responseValue),
    64
  ).toLowerCase();
  if (!Number.isInteger(revision) || revision < 1 || !HASH_PATTERN.test(hash)) {
    return {
      ok: false,
      status: 502,
      reason: "Session Planner write did not return a valid checkpoint.",
    };
  }
  return Object.freeze({
    ok: true,
    status: result.status,
    revision,
    hash,
    value: responseValue,
  });
}
