import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const saveAcceptanceAssets = Object.freeze([
  "medical-merge.js",
  "platform-auth-boot.js",
  "src/core/central-sync-runtime-service.mjs",
  "src/modules/medical/medical-runtime-state-service.mjs",
  "src/modules/medical/medical-view-preferences.mjs",
  "src/modules/session-planner/session-save-client.mjs",
  "src/modules/session-planner/session-save-review.mjs",
  "src/modules/session-planner/session-tactical-storage.mjs",
]);
const origin = "https://staging.footballscience.xyz";
const hash = value => createHash("sha256").update(value).digest("hex");

// Public bytes only, before login or fixtures. This supplements the exact backend
// and deployment-id guard; it does not certify hidden server code or permissions.
export async function verifySaveAcceptanceFrontend({ baseUrl, fetchImpl = fetch,
  readSource = path => readFileSync(new URL("../../" + path, import.meta.url)),
} = {}) {
  if (baseUrl?.replace(/\/$/, "") !== origin) throw new Error("Exact staging origin required for frontend verification");
  for (const path of saveAcceptanceAssets) {
    let response, matches = false;
    try {
      const expected = hash(readSource(path));
      response = await fetchImpl(origin + "/" + path, {
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      matches = response.ok && hash(Buffer.from(await response.arrayBuffer())) === expected;
    } catch {
      throw new Error(`Staging frontend could not be verified: ${path}. No test fixtures created.`);
    }
    if (!matches) throw new Error(`Staging frontend differs from reviewed source: ${path}. No test fixtures created.`);
  }
  return { verifiedAssets: saveAcceptanceAssets.length, fixturesCreated: false };
}
