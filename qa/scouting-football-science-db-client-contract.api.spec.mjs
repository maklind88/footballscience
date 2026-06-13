import { expect, test } from "@playwright/test";
import {
  createFootballScienceDbApiClient,
  createFootballScienceDbSearchParams,
} from "../src/modules/scouting/index.mjs";

function createResponse({ ok = true, status = 200, body = "" } = {}) {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  };
}

test("Football Science DB client builds compact query strings", () => {
  const params = createFootballScienceDbSearchParams({
    action: "players",
    query: "Ada",
    empty: "",
    nil: null,
    zero: 0,
    bool: false,
  });

  expect(params.toString()).toBe("action=players&query=Ada&zero=0&bool=false");
});

test("Football Science DB client sends authenticated no-store GET requests", async () => {
  const calls = [];
  const client = createFootballScienceDbApiClient({
    getAccessToken: async (options) => {
      calls.push(["token", options]);
      return "token-1";
    },
    fetchRef: async (...args) => {
      calls.push(["fetch", args]);
      return createResponse({ body: JSON.stringify({ ok: true, players: [{ id: "p1" }] }) });
    },
  });

  await expect(client.fetchApi({ action: "players", query: "Ada Example" })).resolves.toEqual({
    ok: true,
    status: 200,
    result: { ok: true, players: [{ id: "p1" }] },
  });
  expect(calls[0]).toEqual(["token", { forceRefresh: false }]);
  expect(calls[1][1][0]).toBe("/api/football-science-db?action=players&query=Ada+Example");
  expect(calls[1][1][1]).toMatchObject({
    method: "GET",
    headers: { Authorization: "Bearer token-1" },
    cache: "no-store",
  });
});

test("Football Science DB client retries once with a refreshed auth token after 401", async () => {
  const tokens = [];
  const urls = [];
  const client = createFootballScienceDbApiClient({
    getAccessToken: async (options) => {
      tokens.push(options);
      return options.forceRefresh ? "fresh-token" : "stale-token";
    },
    fetchRef: async (url, request) => {
      urls.push([url, request.headers.Authorization]);
      return urls.length === 1
        ? createResponse({ ok: false, status: 401, body: JSON.stringify({ reason: "expired" }) })
        : createResponse({ ok: true, status: 200, body: JSON.stringify({ ok: true, player: { id: "p1" } }) });
    },
  });

  await expect(client.fetchApi({ action: "profile", fsdbId: "p1" })).resolves.toEqual({
    ok: true,
    status: 200,
    result: { ok: true, player: { id: "p1" } },
  });
  expect(tokens).toEqual([{ forceRefresh: false }, { forceRefresh: true }]);
  expect(urls).toEqual([
    ["/api/football-science-db?action=profile&fsdbId=p1", "Bearer stale-token"],
    ["/api/football-science-db?action=profile&fsdbId=p1", "Bearer fresh-token"],
  ]);
});

test("Football Science DB client returns safe failures for auth, response, text, and network errors", async () => {
  const noAuth = createFootballScienceDbApiClient({
    getAccessToken: async () => "",
    fetchRef: async () => createResponse(),
  });
  await expect(noAuth.fetchApi({ action: "players" })).resolves.toEqual({
    ok: false,
    status: 401,
    reason: "Football Science DB requires an authenticated session.",
  });

  const serverError = createFootballScienceDbApiClient({
    getAccessToken: async () => "token",
    fetchRef: async () => createResponse({ ok: false, status: 500, body: JSON.stringify({ message: "Server said no" }) }),
  });
  await expect(serverError.fetchApi({ action: "players" })).resolves.toEqual({
    ok: false,
    status: 500,
    reason: "Server said no",
  });

  const textError = createFootballScienceDbApiClient({
    getAccessToken: async () => "token",
    fetchRef: async () => createResponse({ ok: false, status: 502, body: "Gateway unavailable" }),
  });
  await expect(textError.fetchApi({ action: "players" })).resolves.toEqual({
    ok: false,
    status: 502,
    reason: "Gateway unavailable",
  });

  const networkError = createFootballScienceDbApiClient({
    getAccessToken: async () => "token",
    fetchRef: async () => {
      throw new Error("network down");
    },
  });
  await expect(networkError.fetchApi({ action: "players" })).resolves.toEqual({
    ok: false,
    status: 0,
    reason: "network down",
  });
});
