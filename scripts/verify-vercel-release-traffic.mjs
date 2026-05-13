import { execFileSync } from "node:child_process";
import process from "node:process";

const blockingWorkflows = [
  "Production Deploy",
  "Staging Deploy",
  "Production Rollback",
];
const activeStatuses = new Set(["queued", "in_progress", "requested", "waiting", "pending"]);

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listRuns(workflow) {
  const output = gh([
    "run",
    "list",
    "--workflow",
    workflow,
    "--json",
    "conclusion,createdAt,databaseId,event,headBranch,headSha,status,url,workflowName",
    "--limit",
    "10",
  ]);
  return JSON.parse(output || "[]");
}

if (process.env.RELEASE_SKIP_TRAFFIC_GUARD === "1") {
  console.log("Vercel release traffic guard: skipped by RELEASE_SKIP_TRAFFIC_GUARD=1");
  process.exit(0);
}

const activeRuns = [];

try {
  for (const workflow of blockingWorkflows) {
    for (const run of listRuns(workflow)) {
      if (activeStatuses.has(String(run.status || ""))) {
        activeRuns.push(run);
      }
    }
  }
} catch (error) {
  console.error("Vercel release traffic guard failed before deploy:");
  console.error(`- Could not inspect GitHub release workflow traffic: ${error.message}`);
  process.exit(1);
}

if (activeRuns.length) {
  console.error("Vercel release traffic guard stopped deploy:");
  for (const run of activeRuns) {
    const sha = String(run.headSha || "").slice(0, 7) || "unknown";
    console.error(
      `- ${run.workflowName || "workflow"} is ${run.status} on ${run.headBranch || "unknown"} (${sha}): ${run.url || `run ${run.databaseId}`}`,
    );
  }
  console.error("- Wait for the active release workflow to finish, then run deploy again.");
  process.exit(1);
}

console.log("Vercel release traffic guard: ok");
