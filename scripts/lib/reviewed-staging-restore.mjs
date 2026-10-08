import { createHash } from "node:crypto";
import { saveAcceptanceAssets } from "../../qa/helpers/save-acceptance-frontend.mjs";
import { supabaseRefFromConfig } from "./vercel-protected-read.mjs";

export const stagingRestoreTarget = Object.freeze({
  staging: "staging.footballscience.xyz", production: "footballscience.xyz",
  project: "prj_GazeaGD3eThx8p2w1m334AAFNN0x", team: "team_ayMHRHhvpCWLhB7Hss525k0z",
  database: "pokrksgempkuraueglpu",
});
export const stagingRestoreAssets = Object.freeze(["app-runtime.js", ...saveAcceptanceAssets]);
const hash = value => createHash("sha256").update(value).digest("hex");
const id = deployment => deployment.id || deployment.uid;

export function validateStagingRestoreInput({ deploymentUrl, sourceSha, projectId, teamId, stagingUrl }) {
  let url;
  try { url = new URL(deploymentUrl); } catch { throw new Error("An exact reviewed deployment URL is required."); }
  if (url.origin !== deploymentUrl || url.protocol !== "https:" || url.port || url.username || url.password
    || !/^footballscience-[a-z0-9]+-makattack\.vercel\.app$/.test(url.hostname)) {
    throw new Error("Only an exact Football Science immutable deployment URL is allowed.");
  }
  if (!/^[a-f0-9]{40}$/.test(sourceSha || "")) throw new Error("An exact reviewed source SHA is required.");
  if (projectId !== stagingRestoreTarget.project || teamId !== stagingRestoreTarget.team
    || stagingUrl !== `https://${stagingRestoreTarget.staging}`) throw new Error("Staging restore target mismatch.");
  return url.hostname;
}

// The caller owns clean-worktree/exact-HEAD checks and the GitHub release queue.
// All reads and source comparisons finish before the only allowed alias mutation.
export async function restoreReviewedStaging({ input, inspect, readText, readSource, assign, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 18 }) {
  const host = validateStagingRestoreInput(input);
  const deployment = await inspect(host);
  if (!id(deployment) || deployment.url !== host || deployment.projectId !== stagingRestoreTarget.project
    || deployment.readyState !== "READY" || deployment.target === "production") throw new Error("Reviewed deployment is not a ready canonical preview.");
  const productionBefore = await inspect(stagingRestoreTarget.production);
  if (!id(productionBefore) || id(productionBefore) === id(deployment)) throw new Error("Production and staging must be distinct.");
  const verify = async host => {
    let config;
    try { config = JSON.parse(await readText(host, "api/client-config")); } catch { throw new Error("Staging configuration could not be read."); }
    if (supabaseRefFromConfig(config) !== stagingRestoreTarget.database || config.buildId !== id(deployment)) {
      throw new Error("Staging database or exact deployment build does not match.");
    }
    for (const asset of stagingRestoreAssets) {
      if (hash(await readText(host, asset)) !== hash(await readSource(input.sourceSha, asset))) {
        throw new Error(`Reviewed staging source mismatch: ${asset}`);
      }
    }
  };
  await verify(host);
  // Use the inspected immutable deployment ID, never a moving branch alias.
  await assign(id(deployment), stagingRestoreTarget.staging);
  let verified = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const routed = await inspect(stagingRestoreTarget.staging);
    if (id(routed) === id(deployment)) { await verify(stagingRestoreTarget.staging); verified = true; break; }
    if (attempt + 1 < attempts) await pause(5000);
  }
  if (!verified) throw new Error("Staging alias verification failed. No automatic rollback was attempted.");
  if (id(await inspect(stagingRestoreTarget.production)) !== id(productionBefore)) throw new Error("Production routing changed during staging restore; investigate before continuing.");
  return { deploymentId: id(deployment), sourceSha: input.sourceSha, verifiedAssets: stagingRestoreAssets.length, productionUnchanged: true };
}
