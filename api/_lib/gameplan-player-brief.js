"use strict";

const crypto = require("node:crypto");
const { dataSafetyRegistry } = require("../../src/core/data-safety-contracts.cjs");
const { readConfig } = require("./supabase-admin.js");

const STATE_BUCKET = "footballscience-app-state";
const STATE_PREFIX = "global";
const GAMEPLAN_KEY = "football-gameplan-v1";
const PLAYER_PROFILES_KEY = "football-player-profiles-v1";
const TOKEN_SCOPE = "gameplan-player-brief";
const DEFAULT_TOKEN_TTL_HOURS = 72;
const MAX_TOKEN_TTL_HOURS = 14 * 24;
const MAX_TEXT_LENGTH = 1200;

function normalizeText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeParseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function getPlayerBriefSecret(options = {}) {
  return normalizeText(
    options.secret ||
      process.env.GAMEPLAN_PLAYER_BRIEF_SECRET ||
      process.env.PLAYER_BRIEF_LINK_SECRET ||
      process.env.PLATFORM_PLAYER_BRIEF_SECRET,
    4096
  );
}

function signTokenPayload(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createPlayerBriefToken(payload = {}, options = {}) {
  const secret = getPlayerBriefSecret(options);
  if (!secret) {
    return { ok: false, status: 500, reason: "Player Brief signing secret is not configured." };
  }

  const planId = normalizeText(payload.planId, 180);
  const playerId = normalizeText(payload.playerId, 180);
  if (!planId || !playerId) {
    return { ok: false, status: 400, reason: "Missing plan or player for Player Brief link." };
  }

  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const ttlHours = Math.max(
    1,
    Math.min(MAX_TOKEN_TTL_HOURS, Number(payload.expiresInHours || options.expiresInHours || DEFAULT_TOKEN_TTL_HOURS) || DEFAULT_TOKEN_TTL_HOURS)
  );
  const tokenPayload = {
    scope: TOKEN_SCOPE,
    planId,
    playerId,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor((nowMs + ttlHours * 60 * 60 * 1000) / 1000),
    nonce: crypto.randomBytes(10).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = signTokenPayload(encodedPayload, secret);
  return {
    ok: true,
    token: `${encodedPayload}.${signature}`,
    payload: tokenPayload,
    expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
  };
}

function verifyPlayerBriefToken(token, options = {}) {
  const secret = getPlayerBriefSecret(options);
  if (!secret) {
    return { ok: false, status: 500, reason: "Player Brief signing secret is not configured." };
  }

  const [encodedPayload, signature, extra] = String(token || "").split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false, status: 401, reason: "Invalid Player Brief link." };
  }

  const expectedSignature = signTokenPayload(encodedPayload, secret);
  if (!safeEqualString(signature, expectedSignature)) {
    return { ok: false, status: 401, reason: "Invalid Player Brief link." };
  }

  const payload = safeParseJson(base64UrlDecode(encodedPayload), null);
  const nowSeconds = Math.floor((Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now()) / 1000);
  if (!payload || payload.scope !== TOKEN_SCOPE) {
    return { ok: false, status: 401, reason: "Invalid Player Brief link." };
  }
  if (!normalizeText(payload.planId, 180) || !normalizeText(payload.playerId, 180)) {
    return { ok: false, status: 401, reason: "Invalid Player Brief link." };
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds) {
    return { ok: false, status: 401, reason: "Player Brief link has expired." };
  }

  return {
    ok: true,
    payload: {
      scope: TOKEN_SCOPE,
      planId: normalizeText(payload.planId, 180),
      playerId: normalizeText(payload.playerId, 180),
      iat: Number.isInteger(payload.iat) ? payload.iat : 0,
      exp: payload.exp,
      nonce: normalizeText(payload.nonce, 80),
    },
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

function getStorageBaseUrl() {
  const { url, serviceRoleKey } = readConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }
  return { url: `${url}/storage/v1`, serviceRoleKey };
}

function storageHeaders(serviceRoleKey, contentType = "application/json") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function parseStorageResponse(response, raw = false) {
  const text = await response.text();
  if (raw) {
    return text;
  }
  if (!text) {
    return {};
  }
  return safeParseJson(text, { message: text });
}

async function storageRequest(path, options = {}) {
  const storage = getStorageBaseUrl();
  const response = await fetch(`${storage.url}${path}`, {
    ...options,
    headers: {
      ...storageHeaders(storage.serviceRoleKey, options.contentType),
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return { ok: false, status: 404, payload: {} };
  }

  const payload = await parseStorageResponse(response, Boolean(options.raw));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
      reason: payload?.error || payload?.message || payload?.msg || `Storage request failed (${response.status}).`,
    };
  }

  return { ok: true, status: response.status, payload };
}

async function ensureStateBucket() {
  const existing = await storageRequest(`/bucket/${encodeURIComponent(STATE_BUCKET)}`, { method: "GET" });
  if (existing.ok) {
    return { ok: true };
  }

  const created = await storageRequest("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: STATE_BUCKET,
      name: STATE_BUCKET,
      public: false,
    }),
  });

  if (created.ok || created.status === 409 || String(created.reason || "").toLowerCase().includes("already")) {
    return { ok: true };
  }

  return created;
}

function objectPathForKey(key) {
  return `${STATE_PREFIX}/${encodeURIComponent(key)}.json`;
}

async function readStateObject(key) {
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${objectPathForKey(key)}`, {
    method: "GET",
    raw: true,
    contentType: "",
  });
  if (!result.ok) {
    return null;
  }
  const parsed = safeParseJson(result.payload, null);
  return parsed?.key ? parsed : null;
}

function getStateEntryRevision(entry = {}) {
  const revision = Number(entry?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function hashStateValue(value = "") {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function getActorOrganizationId(actor = {}, previousEntry = {}) {
  return normalizeText(
    previousEntry.organizationId ||
      actor.organizationId ||
      actor.organization_id ||
      actor.clubId ||
      actor.club_id ||
      "global",
    180
  ) || "global";
}

function normalizeGameplanStateEntry(state, previousEntry = {}, actor = {}) {
  const contract = dataSafetyRegistry.requireByKey(GAMEPLAN_KEY);
  const value = JSON.stringify(state && typeof state === "object" ? state : {});
  return {
    schema: "footballscience-app-state-v1",
    key: GAMEPLAN_KEY,
    moduleId: contract.moduleId,
    organizationId: getActorOrganizationId(actor, previousEntry),
    savePipeline: contract.savePipeline,
    sourceOfTruth: contract.sourceOfTruth,
    localPersistence: contract.localPersistence,
    mergePolicy: contract.mergePolicy,
    revision: getStateEntryRevision(previousEntry) + 1,
    value,
    removed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id || "player-brief-link",
    hash: hashStateValue(value),
  };
}

async function writeGameplanStateObject(state, previousEntry = {}, actor = {}) {
  const entry = normalizeGameplanStateEntry(state, previousEntry, actor);
  const path = objectPathForKey(entry.key);
  const result = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "PUT",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  if (result.ok || result.status !== 404) {
    return { ...result, entry };
  }

  const fallback = await storageRequest(`/object/${encodeURIComponent(STATE_BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      "x-upsert": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(entry),
  });

  return { ...fallback, entry };
}

function parseStateValue(entry = {}) {
  return safeParseJson(entry?.value || "{}", {});
}

function findPlan(gameplanState = {}, planId = "") {
  const plans = Array.isArray(gameplanState.gameplans) ? gameplanState.gameplans : [];
  return plans.find((plan) => normalizeText(plan?.id, 180) === planId) || null;
}

function findPlayer(playerProfilesState = {}, playerId = "") {
  const players = Array.isArray(playerProfilesState.players) ? playerProfilesState.players : [];
  const player = players.find((candidate) => normalizeText(candidate?.id, 180) === playerId) || null;
  if (!player) {
    return { id: playerId, name: "", number: "", position: "" };
  }
  return {
    id: playerId,
    name: normalizeText(player.name || player.displayName, 120),
    number: normalizeText(player.number || player.jerseyNumber, 20),
    position: normalizeText(player.position || player.primaryRole, 80),
  };
}

function normalizePhaseMap(source = {}) {
  return ["inPossession", "outOfPossession", "attackingTransition", "defensiveTransition", "setPieces"].reduce(
    (phases, key) => {
      phases[key] = normalizeText(source?.[key], 700);
      return phases;
    },
    {}
  );
}

function getReceipt(brief = {}, playerId = "") {
  const receipt = brief.readReceipts?.[playerId] || {};
  return {
    playerId,
    firstOpenedAt: normalizeText(receipt.firstOpenedAt, 40),
    lastOpenedAt: normalizeText(receipt.lastOpenedAt, 40),
    acknowledgedAt: normalizeText(receipt.acknowledgedAt, 40),
    openCount: Math.max(0, Math.min(9999, Number.parseInt(receipt.openCount, 10) || 0)),
  };
}

function resolvePlayerBriefPayload(gameplanState = {}, playerProfilesState = {}, request = {}) {
  const planId = normalizeText(request.planId, 180);
  const playerId = normalizeText(request.playerId, 180);
  const plan = findPlan(gameplanState, planId);
  const brief = plan?.playerBrief && typeof plan.playerBrief === "object" ? plan.playerBrief : {};
  const audience = new Set(Array.isArray(brief.audiencePlayerIds) ? brief.audiencePlayerIds.map((id) => normalizeText(id, 180)) : []);

  if (!plan) {
    return { ok: false, status: 404, reason: "Brief not found." };
  }
  if (!normalizeText(brief.publishedAt, 40)) {
    return { ok: false, status: 403, reason: "This player brief has not been published yet." };
  }
  if (!playerId || !audience.has(playerId)) {
    return { ok: false, status: 403, reason: "This brief is not assigned to this player." };
  }

  return {
    ok: true,
    plan: {
      id: normalizeText(plan.id, 180),
      title: normalizeText(plan.title || plan.opponent || "Match Plan", 160),
      opponent: normalizeText(plan.opponent || plan.title, 160),
      date: normalizeText(plan.date, 20),
      kickoff: normalizeText(plan.kickoff, 40),
      venue: normalizeText(plan.venue, 180),
      competition: normalizeText(plan.competition, 160),
    },
    player: findPlayer(playerProfilesState, playerId),
    brief: {
      headline: normalizeText(brief.headline, 180),
      message: normalizeText(brief.message, 900),
      focus: normalizeText(brief.focus, 900),
      individualFocus: normalizeText(brief.individualFocus, 900),
      phases: normalizePhaseMap(brief.phases),
      publishedAt: normalizeText(brief.publishedAt, 40),
    },
    receipt: getReceipt(brief, playerId),
  };
}

function upsertPlayerBriefReceipt(gameplanState = {}, request = {}) {
  const planId = normalizeText(request.planId, 180);
  const playerId = normalizeText(request.playerId, 180);
  const plan = findPlan(gameplanState, planId);
  if (!plan || !playerId) {
    return { ok: false, status: 404, reason: "Brief not found." };
  }

  const now = new Date().toISOString();
  const brief = plan.playerBrief && typeof plan.playerBrief === "object" ? plan.playerBrief : {};
  const receipts = {
    ...(brief.readReceipts && typeof brief.readReceipts === "object" && !Array.isArray(brief.readReceipts) ? brief.readReceipts : {}),
  };
  const previous = receipts[playerId] || {};
  const previousOpenCount = Number.parseInt(previous.openCount, 10) || 0;
  const shouldCountOpen = request.countOpen !== false;
  receipts[playerId] = {
    playerId,
    firstOpenedAt: normalizeText(previous.firstOpenedAt, 40) || now,
    lastOpenedAt: now,
    acknowledgedAt: request.acknowledge ? normalizeText(previous.acknowledgedAt, 40) || now : normalizeText(previous.acknowledgedAt, 40),
    openCount: shouldCountOpen || previousOpenCount === 0 ? Math.min(9999, previousOpenCount + 1) : previousOpenCount,
  };

  plan.playerBrief = {
    ...brief,
    readReceipts: receipts,
  };
  plan.updatedAt = now;
  gameplanState.updatedAt = now;
  return { ok: true, receipt: receipts[playerId], state: gameplanState };
}

async function readGameplanBriefState() {
  const bucket = await ensureStateBucket();
  if (!bucket.ok) {
    return { ok: false, status: 500, reason: bucket.reason || "Central state bucket is not available." };
  }

  const [gameplanEntry, playerProfilesEntry] = await Promise.all([
    readStateObject(GAMEPLAN_KEY),
    readStateObject(PLAYER_PROFILES_KEY),
  ]);

  return {
    ok: true,
    gameplanEntry,
    playerProfilesEntry,
    gameplanState: parseStateValue(gameplanEntry),
    playerProfilesState: parseStateValue(playerProfilesEntry),
  };
}

function buildPlayerBriefUrl(req, token) {
  const host = normalizeText(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "footballscience.xyz", 240);
  const protocol = normalizeText(req?.headers?.["x-forwarded-proto"] || "https", 20).split(",", 1)[0] || "https";
  const url = new URL(`${protocol}://${host}/`);
  url.searchParams.set("workspace", "gameplan");
  url.searchParams.set("playerBrief", "1");
  url.searchParams.set("token", token);
  return url.toString();
}

module.exports = {
  GAMEPLAN_KEY,
  PLAYER_PROFILES_KEY,
  TOKEN_SCOPE,
  buildPlayerBriefUrl,
  createPlayerBriefToken,
  readGameplanBriefState,
  resolvePlayerBriefPayload,
  upsertPlayerBriefReceipt,
  verifyPlayerBriefToken,
  writeGameplanStateObject,
};
