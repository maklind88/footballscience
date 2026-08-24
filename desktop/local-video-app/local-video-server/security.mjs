import { randomBytes, timingSafeEqual } from "node:crypto";
import { isAllowedOrigin } from "./config.mjs";

function tokenValue() {
  return randomBytes(32).toString("base64url");
}

function sameToken(first = "", second = "") {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length
    && firstBuffer.length > 0
    && timingSafeEqual(firstBuffer, secondBuffer);
}

function nowMs(clock) {
  return Number(clock()) || Date.now();
}

export function requestOrigin(request = {}) {
  return String(request.headers?.origin || "").trim().replace(/\/$/, "");
}

export function corsHeaders(request = {}, config = {}, extra = {}) {
  const origin = requestOrigin(request);
  const allowed = isAllowedOrigin(origin, config);
  return {
    ...(allowed ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET,HEAD,POST,DELETE,OPTIONS",
    "access-control-allow-headers": [
      "content-type",
      "x-football-science-file-name",
      "x-football-science-prepare-mode",
      "x-football-science-session",
      "range",
    ].join(","),
    "access-control-allow-private-network": "true",
    "access-control-expose-headers": "content-length,content-range,accept-ranges,retry-after",
    "access-control-max-age": "600",
    vary: "Origin",
    ...extra,
  };
}

export function createBridgeSessionStore(options = {}) {
  const sessions = new Map();
  const clock = options.clock || Date.now;
  const ttlMs = Math.max(60_000, Number(options.ttlMs) || 12 * 60 * 60 * 1000);

  function prune() {
    const current = nowMs(clock);
    for (const [token, session] of sessions) {
      if (session.expiresAtMs <= current) sessions.delete(token);
    }
  }

  return {
    issue(origin) {
      prune();
      const token = tokenValue();
      const issuedAtMs = nowMs(clock);
      const session = { token, origin, issuedAtMs, expiresAtMs: issuedAtMs + ttlMs };
      sessions.set(token, session);
      return { ...session };
    },
    validate(token, origin) {
      prune();
      const session = sessions.get(String(token || ""));
      return Boolean(session && sameToken(session.token, token) && session.origin === origin);
    },
    revoke(token) {
      return sessions.delete(String(token || ""));
    },
    size() {
      prune();
      return sessions.size;
    },
  };
}

export function createAssetAccessStore(options = {}) {
  const assets = new Map();
  const clock = options.clock || Date.now;
  const ttlMs = Math.max(60_000, Number(options.ttlMs) || 24 * 60 * 60 * 1000);

  function prune() {
    const current = nowMs(clock);
    for (const [assetId, asset] of assets) {
      if (asset.expiresAtMs <= current) assets.delete(assetId);
    }
  }

  return {
    issue(assetId, origin) {
      prune();
      const issuedAtMs = nowMs(clock);
      const asset = {
        assetId: String(assetId || ""),
        origin,
        token: tokenValue(),
        expiresAtMs: issuedAtMs + ttlMs,
      };
      assets.set(asset.assetId, asset);
      return { ...asset };
    },
    validate(assetId, token, origin = "") {
      prune();
      const asset = assets.get(String(assetId || ""));
      if (!asset || !sameToken(asset.token, token)) return false;
      return !origin || asset.origin === origin;
    },
    revoke(assetId) {
      return assets.delete(String(assetId || ""));
    },
  };
}

export function sessionTokenFromRequest(request = {}) {
  return String(request.headers?.["x-football-science-session"] || "").trim();
}

