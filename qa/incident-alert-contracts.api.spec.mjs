import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

test("production incident alerts create issue-backed alerts for failed release workflows", () => {
  const packageJson = readJson("package.json");
  const workflow = readProjectFile(".github/workflows/production-incident-alert.yml");
  const alertScript = readProjectFile("scripts/create-incident-alert.mjs");
  const readinessScript = readProjectFile("scripts/verify-incident-readiness.mjs");
  const deploymentDocs = readProjectFile("docs/DEPLOYMENT.md");
  const incidentRunbook = readProjectFile("docs/INCIDENT_RESPONSE.md");

  expect(packageJson.scripts["release:incident-alert"]).toBe("node scripts/create-incident-alert.mjs");
  expect(packageJson.scripts["release:incident-readiness"]).toBe("node scripts/verify-incident-readiness.mjs");
  expect(packageJson.scripts["qa"]).toContain("npm run release:incident-readiness");
  expect(packageJson.scripts["qa:contracts"]).toContain("qa/incident-alert-contracts.api.spec.mjs");

  expect(workflow).toContain("workflow_run:");
  expect(workflow).toContain("Production Deploy");
  expect(workflow).toContain("Production Monitor");
  expect(workflow).toContain("Production Rollback");
  expect(workflow).toContain("Supabase Migrations");
  expect(workflow).toContain("issues: write");
  expect(workflow).toContain("github.event.workflow_run.conclusion != 'success'");
  expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
  expect(workflow).toContain("npm run release:incident-alert");

  expect(alertScript).toContain("Production incident:");
  expect(alertScript).toContain("production-incident");
  expect(alertScript).toContain("release-monitor");
  expect(alertScript).toContain("createOrUpdateIncidentIssue");
  expect(alertScript).toContain("INCIDENT_DRY_RUN");
  expect(alertScript).not.toContain("LIVE_QA_PASSWORD");
  expect(alertScript).not.toContain("CRON_SECRET");
  expect(readinessScript).toContain("Incident readiness verification: ok");
  expect(deploymentDocs).toContain("Production Incident Alert");
  expect(incidentRunbook).toContain("Do not paste secrets");
});
