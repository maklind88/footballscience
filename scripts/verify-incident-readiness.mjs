import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireText(relativePath, text, reason) {
  const content = read(relativePath);
  if (!content.includes(text)) {
    failures.push(`${relativePath} must contain ${JSON.stringify(text)} (${reason}).`);
  }
}

function requirePackageScript(name, expected) {
  const packageJson = JSON.parse(read("package.json") || "{}");
  const actual = packageJson.scripts?.[name] || "";
  if (actual !== expected) {
    failures.push(`package.json script ${name} must be ${JSON.stringify(expected)}.`);
  }
}

requirePackageScript("release:incident-alert", "node scripts/create-incident-alert.mjs");
requirePackageScript("release:incident-readiness", "node scripts/verify-incident-readiness.mjs");

requireText("package.json", "npm run release:incident-readiness", "full QA must prove incident alerting is still wired");
requireText("package.json", "scripts/create-incident-alert.mjs", "syntax checks must include the incident alert script");
requireText("package.json", "scripts/verify-incident-readiness.mjs", "syntax checks must include the incident readiness verifier");

requireText(".github/workflows/production-incident-alert.yml", "workflow_run:", "incident alerting must follow completed workflow runs");
requireText(".github/workflows/production-incident-alert.yml", "Production Deploy", "production deploy failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "Production Monitor", "production monitor failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "Production Rollback", "rollback failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "Supabase Migrations", "migration failures must alert");
requireText(".github/workflows/production-incident-alert.yml", "github.event.workflow_run.head_branch == 'main'", "QA failures should only alert for main");
requireText(".github/workflows/production-incident-alert.yml", "issues: write", "workflow must be able to create incident issues");
requireText(".github/workflows/production-incident-alert.yml", "npm run release:incident-alert", "workflow must call the incident script");
requireText(".github/workflows/production-incident-alert.yml", "github.event.workflow_run.conclusion != 'success'", "successful runs must not create incidents");

requireText("scripts/create-incident-alert.mjs", "Production incident:", "issues must have a stable incident title");
requireText("scripts/create-incident-alert.mjs", "production-incident", "issues must carry a production incident label");
requireText("scripts/create-incident-alert.mjs", "createOrUpdateIncidentIssue", "repeated failures must update existing incident issues");
requireText("scripts/create-incident-alert.mjs", "Do not deploy over this incident", "incident body must include a release safety guardrail");
requireText("scripts/create-incident-alert.mjs", "INCIDENT_DRY_RUN", "incident script must be safely testable without GitHub writes");

requireText("docs/INCIDENT_RESPONSE.md", "Production Incident Alert", "incident runbook must explain alert source");
requireText("docs/INCIDENT_RESPONSE.md", "Production Rollback", "incident runbook must include rollback guidance");
requireText("docs/STABILITY_PLAN.md", "Production Incident Alert", "stability plan must mention automated incident alerts");
requireText("docs/DEPLOYMENT.md", "Production Incident Alert", "deployment guide must mention automated incident alerts");
requireText("docs/SECURITY_CONTROL_PLANE.md", "Production Incident Alert", "security control plane must include the incident alert destination");

if (failures.length) {
  console.error("Incident readiness verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Incident readiness verification: ok");
}
