import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createProtectedReleaseFetch, readReleaseClientConfig, supabaseRefFromConfig } from "../scripts/lib/vercel-protected-read.mjs";

const origin = "https://footballscience-git-staging-makattack.vercel.app";
const configUrl = `${origin}/api/client-config`;
const config = { ok: true, url: "https://pokrksgempkuraueglpu.supabase.co" };
const denied = () => new Response("", { status: 302, headers: { location: "https://vercel.com/login" } });

function harness(overrides = {}) {
  const calls = [];
  const fetchImpl = createProtectedReleaseFetch({
    fetchImpl: async () => denied(), env: { VERCEL_TOKEN: "secret-test-value" },
    verifyLink: () => calls.push("link"),
    run: async (...args) => { calls.push(args); return { stdout: JSON.stringify(config) + "\n200" }; },
    ...overrides,
  });
  return { fetchImpl, calls };
}

test("protected config authenticates using pinned CLI without following redirects", async () => {
  const { fetchImpl, calls } = harness();
  expect(await readReleaseClientConfig(fetchImpl, configUrl)).toEqual(config);
  expect(calls[0]).toBe("link");
  expect(calls[1][0]).toBe("npx");
  expect(calls[1][1]).toContain("vercel@53.2.0");
  expect(calls[1][1]).toContain(origin);
  expect(calls[1][1]).toContain("--no-location");
  expect(calls[1][2].timeout).toBe(90_000);
});

test("public response stays public and direct requests prohibit redirects", async () => {
  const { fetchImpl, calls } = harness({ fetchImpl: async (_url, options) => {
    expect(options.redirect).toBe("manual");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return Response.json(config);
  } });
  expect(await readReleaseClientConfig(fetchImpl, configUrl)).toEqual(config);
  expect(calls).toEqual([]);
});

for (const url of ["https://attacker.example/api/client-config", "https://footballscience.xyz/api/client-config", `${origin}/api/app-state`]) {
  test(`credentials are never sent on fallback to ${url}`, async () => {
    const { fetchImpl, calls } = harness();
    await expect(fetchImpl(url)).rejects.toThrow(/refused/);
    expect(calls).toEqual([]);
  });
}

test("incorrect project link stops authentication", async () => {
  const { fetchImpl, calls } = harness({ verifyLink: () => { throw new Error("wrong project"); } });
  await expect(fetchImpl(configUrl)).rejects.toThrow(/wrong project/);
  expect(calls).toEqual([]);
});

test("CLI failures redact credentials and captured output", async () => {
  const { fetchImpl } = harness({ run: async () => { throw new Error("secret-test-value in CLI output"); } });
  try { await fetchImpl(configUrl); throw new Error("unexpected success"); } catch (error) {
    expect(error.message).toContain("Authenticated release probe failed");
    expect(error.message).not.toContain("secret-test-value");
  }
});

for (const output of ["login\n302", "denied\n401", "failed\n500", "not a response", "body\n000"]) {
  test(`authenticated non-success output is rejected: ${output}`, async () => {
    const { fetchImpl } = harness({ run: async () => ({ stdout: output }) });
    await expect(fetchImpl(configUrl)).rejects.toThrow(/non-success/);
  });
}

for (const body of ["<html>Login</html>", "{}", '{"url":"https://pokrksgempkuraueglpu.supabase.co.attacker.example"}', '{"url":"https://attacker.example/pokrksgempkuraueglpu"}']) {
  test(`client config fails closed: ${body}`, async () => {
    const { fetchImpl } = harness({ run: async () => ({ stdout: body + "\n200" }) });
    await expect(readReleaseClientConfig(fetchImpl, configUrl)).rejects.toThrow(/JSON|Supabase URL/);
  });
}

test("network failures and application errors do not trigger credential retries", async () => {
  const network = harness({ fetchImpl: async () => { throw new Error("offline"); } });
  await expect(network.fetchImpl(configUrl)).rejects.toThrow("offline");
  expect(network.calls).toEqual([]);
  const failed = harness({ fetchImpl: async () => new Response("", { status: 500 }) });
  await expect(readReleaseClientConfig(failed.fetchImpl, configUrl)).rejects.toThrow(/500/);
  expect(failed.calls).toEqual([]);
});

test("Supabase identity uses an exact HTTPS host", () => {
  expect(supabaseRefFromConfig(config)).toBe("pokrksgempkuraueglpu");
  for (const url of ["http://pokrksgempkuraueglpu.supabase.co", "https://user@pokrksgempkuraueglpu.supabase.co", "https://pokrksgempkuraueglpu.supabase.co/?wrong=1"]) {
    expect(() => supabaseRefFromConfig({ url })).toThrow(/invalid Supabase/);
  }
});

for (const scenario of ["isolated", "same-database", "missing-live", "branch-mismatch", "login-page"]) {
  test(`isolation executable fails closed: ${scenario}`, () => {
    const bootstrap = `globalThis.fetch = async input => {
      const host = new URL(input).hostname;
      const scenario = ${JSON.stringify(scenario)};
      if (scenario === "login-page") return new Response("<html>login</html>");
      let ref = host === "footballscience.xyz" ? "bustidorxevacosqhkcz" : "pokrksgempkuraueglpu";
      if (scenario === "same-database") ref = "bustidorxevacosqhkcz";
      if (scenario === "branch-mismatch" && host.includes("git-staging")) ref = "aaaaaaaaaaaaaaaaaaaa";
      return Response.json(scenario === "missing-live" && host === "footballscience.xyz" ? {} : {url: "https://" + ref + ".supabase.co"});
    };`;
    const result = spawnSync(process.execPath, [
      "--import", "data:text/javascript;base64," + Buffer.from(bootstrap).toString("base64"),
      fileURLToPath(new URL("../scripts/verify-staging-live-isolation.mjs", import.meta.url)),
    ], { encoding: "utf8", env: { ...process.env, LIVE_QA_BASE_URL: "https://footballscience.xyz", STAGING_QA_BASE_URL: "https://staging.footballscience.xyz", STAGING_BRANCH_ALIAS: new URL(origin).hostname }, timeout: 10_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(scenario === "isolated" ? 0 : 1);
  });
}
