import { canonicalJson, invariant } from "./leaderboard-production-release-security.mjs";

const deploymentIdPattern = /^dpl_[A-Za-z0-9]+$/;
const generatedHostPattern = /^footballscience-[a-z0-9]+-makattack\.vercel\.app$/;

function exactFallback(primary, fallback, label) {
  if (primary !== undefined && fallback !== undefined) invariant(primary === fallback, `Vercel deployment contained conflicting ${label} fields.`);
  return primary !== undefined ? primary : fallback;
}

export function deploymentProjectId(record) { return exactFallback(record?.projectId, record?.project?.id, "project id"); }
export function deploymentGitCommitSha(record) {
  const value = exactFallback(record?.meta?.githubCommitSha, record?.meta?.gitCommitSha, "git commit SHA");
  invariant(/^[0-9a-f]{40}$/.test(value || ""), "Vercel deployment git commit SHA was missing or invalid.");
  return value;
}
export function deploymentState(record) {
  const state = exactFallback(record?.readyState, record?.state, "state");
  invariant(["BUILDING", "CANCELED", "ERROR", "INITIALIZING", "QUEUED", "READY"].includes(state), "Vercel deployment state was missing or unknown.");
  return state;
}
export function deploymentCreatedAt(record) {
  const value = exactFallback(record?.createdAt, record?.created, "creation time");
  invariant(Number.isSafeInteger(value) && value > 0, "Vercel deployment creation time was malformed.");
  return value;
}

export function assertVercelProject(project, baseline) {
  const expected = baseline.vercel;
  const filesApi = expected.filesApi;
  invariant(project && typeof project === "object" && !Array.isArray(project), "Vercel project response was malformed.");
  invariant(project.id === expected.projectId && project.accountId === expected.teamId && project.name === expected.projectName, "Vercel project identity drifted.");
  invariant(project.link && project.link.type === "github" && String(project.link.repoId) === filesApi.project.repoId, "Vercel project repository link drifted.");
  invariant(project.link.repo === expected.projectName && project.link.org === baseline.repository.fullName.split("/")[0], "Vercel project repository owner/name drifted.");
  invariant(Object.hasOwn(project, "rootDirectory") && project.rootDirectory === filesApi.project.rootDirectory, "Vercel project root directory drifted or was omitted.");
  invariant(Object.hasOwn(project, "commandForIgnoringBuildStep") && project.commandForIgnoringBuildStep === filesApi.project.commandForIgnoringBuildStep, "Vercel project ignore override drifted or was omitted.");
  invariant(Object.hasOwn(project, "autoAssignCustomDomains") && project.autoAssignCustomDomains === filesApi.project.productionRequiresAutoAssignCustomDomains, "Vercel project autoAssignCustomDomains was omitted, malformed, or drifted.");
  return { id: project.id, accountId: project.accountId, name: project.name, repoId: String(project.link.repoId), rootDirectory: project.rootDirectory, commandForIgnoringBuildStep: project.commandForIgnoringBuildStep, autoAssignCustomDomains: project.autoAssignCustomDomains };
}

export function assertProductionProjectEligible(project, baseline) {
  const normalized = assertVercelProject(project, baseline);
  invariant(baseline.vercel.filesApi.production.enabled === true, "Files API production is disabled pending a separately reviewed preview proof.");
  invariant(normalized.autoAssignCustomDomains === baseline.vercel.filesApi.project.productionRequiresAutoAssignCustomDomains, "Production domains may auto-assign; staged production creation is forbidden.");
  return normalized;
}

export function deploymentId(record) {
  const id = exactFallback(record?.id, record?.uid, "id") || "";
  invariant(deploymentIdPattern.test(id), "Vercel deployment id was invalid.");
  return id;
}

function assertDeploymentBase(record, expected, baseline) {
  invariant(record && typeof record === "object" && !Array.isArray(record), "Vercel deployment response was malformed.");
  const id = deploymentId(record);
  invariant(deploymentProjectId(record) === baseline.vercel.projectId && record.teamId === baseline.vercel.teamId && record.name === baseline.vercel.projectName, "Vercel deployment project/team drifted.");
  invariant(canonicalJson(record.meta) === canonicalJson(expected.meta), "Vercel deployment metadata drifted.");
  invariant(typeof record.url === "string" && generatedHostPattern.test(record.url), "Vercel deployment URL was not the canonical generated host.");
  invariant(Array.isArray(record.alias) && record.alias.length === 0, "Vercel deployment unexpectedly acquired an alias.");
  invariant(record.customEnvironment === null || record.customEnvironment === undefined, "Vercel deployment unexpectedly selected a custom environment.");
  return id;
}

export function assertPreviewDeployment(record, expected, baseline) {
  const id = assertDeploymentBase(record, expected, baseline);
  invariant(Object.hasOwn(record, "target") && record.target === null, "Vercel preview target was not explicit null.");
  invariant(deploymentState(record) === "READY", "Vercel preview did not become READY.");
  invariant(Number.isFinite(Number(record.buildingAt)) && Number.isFinite(Number(record.ready)) && Number(record.ready) >= Number(record.buildingAt), "Vercel preview lacked a non-skipped build lifecycle.");
  return { id, url: record.url, target: null, readyState: "READY", meta: expected.meta };
}

export function assertStagedProductionDeployment(record, expected, baseline) {
  const id = assertDeploymentBase(record, expected, baseline);
  invariant(record.target === "production" && record.readySubstate === baseline.vercel.filesApi.production.requiredReadySubstate, "Production deployment was not staged.");
  invariant(deploymentState(record) === "READY", "Staged production deployment did not become READY.");
  return { id, url: record.url, target: "production", readySubstate: record.readySubstate };
}

export function aliasSnapshot(records, baseline) {
  invariant(records && typeof records === "object" && !Array.isArray(records), "Vercel alias snapshot was malformed.");
  const hosts = [baseline.hosts.production, baseline.hosts.www, baseline.hosts.staging, baseline.hosts.stagingBranch];
  invariant(canonicalJson(Object.keys(records).sort()) === canonicalJson(hosts.sort()), "Vercel alias snapshot hosts drifted.");
  return Object.fromEntries(hosts.map((host) => [host, deploymentId(records[host])]));
}

export function assertAliasBaseline(snapshot, baseline) {
  invariant(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot), "Vercel alias baseline was malformed.");
  invariant(snapshot[baseline.hosts.production] === baseline.vercel.oldProductionDeployment.id && snapshot[baseline.hosts.www] === baseline.vercel.oldProductionDeployment.id, "Production aliases drifted from the reviewed old-live deployment.");
  invariant(snapshot[baseline.hosts.staging] === baseline.vercel.stagingDeployment.id && snapshot[baseline.hosts.stagingBranch] === baseline.vercel.stagingDeployment.id, "Staging aliases drifted from the reviewed staging deployment.");
  return snapshot;
}

export function assertAliasesUnchanged(before, after) {
  invariant(canonicalJson(before) === canonicalJson(after), "Vercel live or staging aliases moved during the staged deployment.");
  return after;
}

export function assertPreviewSupabaseRef(clientConfig, baseline) {
  let parsed;
  try { parsed = new URL(String(clientConfig?.url || "")); } catch {}
  invariant(baseline.vercel.filesApi.preview.supabaseRef === baseline.supabase.stagingRef, "Preview Supabase ref sources drifted.");
  const expected = `${baseline.vercel.filesApi.preview.supabaseRef}.supabase.co`;
  invariant(parsed?.protocol === "https:" && parsed.hostname === expected && !parsed.port && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash, "Preview did not observe the exact staging Supabase origin.");
  invariant(parsed.hostname !== `${baseline.supabase.productionRef}.supabase.co`, "Preview crossed into the production Supabase tenant.");
  return baseline.vercel.filesApi.preview.supabaseRef;
}
