import { setTimeout as waitForPropagation } from "node:timers/promises";

const productionOrigin = "https://footballscience.xyz";
const stagingOrigin = "https://staging.footballscience.xyz";
const productionRef = "bustidorxevacosqhkcz";
const stagingRef = "pokrksgempkuraueglpu";
const backendUrl = ref => `https://${ref}.supabase.co`;

export async function createIsolatedStagingProbe({
  env = process.env,
  expectedBuild = env.SCHEDULE_QA_EXPECTED_BUILD,
  fetchImpl = fetch,
  wait = waitForPropagation,
} = {}) {
  if (env.STAGING_QA_BASE_URL?.replace(/\/$/, "") !== stagingOrigin ||
      env.STAGING_SUPABASE_PROJECT_REF !== stagingRef || env.SUPABASE_PROJECT_REF !== productionRef) {
    throw new Error("The isolated staging origin and both canonical backend references are required.");
  }
  if (!/^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]{16,64})$/.test(expectedBuild || "")) {
    throw new Error("An exact reviewed staging build is required.");
  }
  const { STAGING_QA_USERNAME: username, STAGING_QA_PASSWORD: password } = env;
  if (!username?.trim() || !password?.trim()) throw new Error("Dedicated staging credentials are required.");

  async function readIdentity(origin) {
    try {
      const url = new URL("/api/client-config", origin);
      url.searchParams.set("qaProbe", crypto.randomUUID());
      const response = await fetchImpl(url.href, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      const value = await response.json();
      if (!response.ok || value.ok !== true) throw new Error();
      return { backend: new URL(value.url).href, build: value.buildId };
    } catch {
      throw new Error("Unable to verify the deployed QA target identity.");
    }
  }

  async function identity() {
    const attempts = 12;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const [staging, production] = await Promise.all([readIdentity(stagingOrigin), readIdentity(productionOrigin)]);
      if (staging.backend !== backendUrl(stagingRef) + "/" || production.backend !== backendUrl(productionRef) + "/") {
        throw new Error("Staging backend isolation is unverified.");
      }
      if (staging.build === expectedBuild && production.build !== staging.build) return;
      // A stale build may be served by another edge shortly after alias assignment.
      // All retries are public reads, and a backend mismatch always aborts.
      if (attempt + 1 < attempts) await wait(2_000);
    }
    throw new Error("Staging exact build identity is unverified.");
  }

  await identity();
  return { origin: stagingOrigin, backend: backendUrl(stagingRef), identity, username, password, expectedBuild };
}
