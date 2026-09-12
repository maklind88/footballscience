import { expect, test } from "@playwright/test";
import { verifyMedicalNoteStaging } from "../scripts/verify-medical-note-staging.mjs";

const ref = "pokrksgempkuraueglpu";
const origin = `https://${ref}.supabase.co`;
const env = {
  STAGING_QA_BASE_URL: "https://qa.example.test",
  STAGING_SUPABASE_PROJECT_REF: ref,
  STAGING_QA_USERNAME: "synthetic-qa@example.test",
  STAGING_QA_PASSWORD: "synthetic-test-password",
};
const jwt = claims => `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;

function harness(overrides = {}) {
  const requests = [], messages = [];
  const token = jwt({ iss: `${origin}/auth/v1`, role: "authenticated", sub: "synthetic-user", ...overrides.claims });
  const fetchImpl = async (address, options = {}) => {
    const url = new URL(address);
    requests.push({ url, options });
    const response = (status, payload) => ({ status, json: async () => payload });
    if (url.pathname === "/api/client-config") {
      if (options.method === "POST") return response(200, { session: { access_token: token } });
      return response(200, { ok: true, url: overrides.backend || origin, anonKey: "sb_publishable_synthetic" });
    }
    if (url.pathname === "/auth/v1/user") return response(200, { id: overrides.userId || "synthetic-user" });
    if (url.pathname === "/auth/v1/logout") return response(overrides.logoutStatus || 204, {});
    if (overrides.networkFailure) throw new Error("network failure");
    if (overrides.rest) return overrides.rest(url, options, response);
    if (options.headers["Accept-Profile"] === "app_private") return response(406, { code: "PGRST106" });
    if (!options.headers.Authorization) return response(401, { code: "42501" });
    if (["coach_note", "internal_note"].includes(url.searchParams.get("select"))) return response(403, { code: "42501" });
    return response(200, []);
  };
  return { requests, messages, run: nextEnv => verifyMedicalNoteStaging({ env: nextEnv || env, fetchImpl, report: value => messages.push(value) }) };
}

test("staging probe verifies eleven HTTP boundaries with no row reads, writes or global logout", async () => {
  const h = harness();
  expect(await h.run()).toEqual({ checks: 11, clinicalRowsRead: 0, dataWrites: 0 });
  const rest = h.requests.filter(r => r.url.pathname.startsWith("/rest/v1/"));
  expect(rest).toHaveLength(11);
  for (const request of rest) {
    expect(request.options.method).toBeUndefined();
    expect(request.url.origin).toBe(origin);
    expect(request.url.searchParams.get("limit")).toBe("0");
  }
  expect(h.requests.filter(r => r.options.method === "POST").map(r => r.url.pathname)).toEqual(["/api/client-config", "/auth/v1/logout"]);
  expect(h.requests.at(-1).url.searchParams.get("scope")).toBe("local");
  expect(h.requests.every(r => r.options.redirect === "error")).toBe(true);
  expect(h.messages.join("\n")).not.toContain(env.STAGING_QA_PASSWORD);
  expect(h.messages.join("\n")).not.toContain("Bearer");
});

for (const [name, patch] of [
  ["missing credentials", { STAGING_QA_PASSWORD: "" }],
  ["production origin", { STAGING_QA_BASE_URL: "https://footballscience.xyz" }],
  ["production ref", { STAGING_SUPABASE_PROJECT_REF: "bustidorxevacosqhkcz" }],
  ["insecure origin", { STAGING_QA_BASE_URL: "http://qa.example.test" }],
]) {
  test(`staging probe rejects ${name} before any request`, async () => {
    const h = harness();
    await expect(h.run({ ...env, ...patch })).rejects.toThrow();
    expect(h.requests).toHaveLength(0);
  });
}

test("backend mismatch stops before transmitting the QA password", async () => {
  const h = harness({ backend: "https://bustidorxevacosqhkcz.supabase.co" });
  await expect(h.run()).rejects.toThrow("backend mismatch");
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0].options.body).toBeUndefined();
});

test("service-role token cannot turn permission checks into a false pass", async () => {
  const h = harness({ claims: { role: "service_role" } });
  await expect(h.run()).rejects.toThrow("authenticated principal");
  expect(h.requests).toHaveLength(2);
});

for (const [name, overrides] of [
  ["Auth user mismatch", { userId: "other-user" }],
  ["a private column is readable", { rest: (url, options, response) => response(200, []) }],
  ["server error instead of permission denial", { rest: (url, options, response) => response(500, { code: "42501" }) }],
  ["unexpected rows", { rest: (url, options, response) => response(200, [{ coach_note: "must not be logged" }]) }],
  ["network failure", { networkFailure: true }],
]) {
  test(`staging probe fails closed and cleans up its own session on ${name}`, async () => {
    const h = harness(overrides);
    await expect(h.run()).rejects.toThrow();
    expect(h.requests.at(-1).url.href).toBe(`${origin}/auth/v1/logout?scope=local`);
    expect(h.messages.join("\n")).not.toContain("must not be logged");
  });
}

test("cleanup failure is not reported as successful verification", async () => {
  const h = harness({ logoutStatus: 500 });
  await expect(h.run()).rejects.toThrow("cleanup failed");
  expect(h.messages.some(m => m.includes("passed"))).toBe(false);
});
