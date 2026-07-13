import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIncidentBody,
  buildIncidentResolutionComment,
  isResolvedConclusion,
  isSupersededCancelledRun,
} from "../scripts/create-incident-alert.mjs";
import {
  buildTrafficIncidentSnapshotMarkdown,
  classifyUserAgent,
  parseTrafficLogText,
  summarizeTrafficEvents,
} from "../scripts/collect-traffic-incident-snapshot.mjs";

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
  expect(workflow).not.toContain("github.event.workflow_run.conclusion != 'success'");
  expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
  expect(workflow).toContain("npm run release:incident-alert");
  expect(workflow).toContain("VERCEL_TOKEN");
  expect(workflow).toContain("VERCEL_PROJECT_ID");

  expect(alertScript).toContain("Production incident:");
  expect(alertScript).toContain("production-incident");
  expect(alertScript).toContain("release-monitor");
  expect(alertScript).toContain("collectTrafficIncidentSnapshot");
  expect(alertScript).toContain("createOrUpdateIncidentIssue");
  expect(alertScript).toContain("resolveOpenIncidentIssue");
  expect(alertScript).toContain("isSupersededCancelledRun");
  expect(alertScript).toContain("state_reason: \"completed\"");
  expect(alertScript).toContain("INCIDENT_DRY_RUN");
  expect(alertScript).not.toContain("LIVE_QA_PASSWORD");
  expect(alertScript).not.toContain("CRON_SECRET");
  expect(readinessScript).toContain("Incident readiness verification: ok");
  expect(deploymentDocs).toContain("Production Incident Alert");
  expect(incidentRunbook).toContain("Do not paste secrets");
  expect(incidentRunbook).toContain("Traffic Snapshot");
});

test("traffic incident snapshots summarize routes while redacting raw IPs and user agents", () => {
  expect(classifyUserAgent("Mozilla/5.0 HeadlessChrome/120.0 test")).toBe("automated-browser");

  const logText = [
    JSON.stringify({
      level: "warning",
      message: JSON.stringify({
        schema: "footballscience-api-security-event-v1",
        eventType: "api.rate_limited",
        route: "/api/chat",
        method: "GET",
        status: 429,
        ip: "162.229.182.58",
        userAgent: "Mozilla/5.0 HeadlessChrome/120.0 full fingerprint",
        ms: 12,
      }),
      requestPath: "/api/chat",
      responseStatusCode: 429,
    }),
    JSON.stringify({
      level: "error",
      message: JSON.stringify({
        schema: "footballscience-api-security-event-v1",
        eventType: "api.request.failed",
        route: "/api/app-state",
        method: "POST",
        status: 500,
        ip: "48.217.108.210",
        userAgent: "curl/8.0",
        ms: 250,
      }),
      requestPath: "/api/app-state",
      responseStatusCode: 500,
    }),
  ].join("\n");

  const events = parseTrafficLogText(logText);
  const summary = summarizeTrafficEvents(events);
  const markdown = buildTrafficIncidentSnapshotMarkdown(summary);
  const body = buildIncidentBody(
    {
      actor: "monitor",
      baseUrl: "https://footballscience.xyz",
      branch: "main",
      conclusion: "failure",
      event: "schedule",
      runUrl: "https://github.com/maklind88/footballscience/actions/runs/1",
      sha: "1234567890abcdef",
      workflowName: "Production Monitor",
    },
    markdown
  );

  expect(summary.topRoutes.map((entry) => entry.route)).toEqual(expect.arrayContaining(["/api/chat", "/api/app-state"]));
  expect(markdown).toContain("Traffic Snapshot");
  expect(markdown).toContain("/api/chat");
  expect(markdown).toContain("429");
  expect(markdown).toContain("automated-browser");
  expect(body).toContain("Traffic Snapshot");
  expect(body).not.toContain("162.229.182.58");
  expect(body).not.toContain("48.217.108.210");
  expect(body).not.toContain("HeadlessChrome/120.0 full fingerprint");
});

test("production incident alerts resolve stale incidents after green workflow runs", () => {
  expect(isResolvedConclusion("success")).toBe(true);
  expect(isResolvedConclusion("skipped")).toBe(true);
  expect(isResolvedConclusion("neutral")).toBe(true);
  expect(isResolvedConclusion("failure")).toBe(false);

  const comment = buildIncidentResolutionComment({
    actor: "qa-bot",
    branch: "main",
    conclusion: "success",
    runUrl: "https://github.com/maklind88/footballscience/actions/runs/1",
    sha: "1234567890abcdef",
    workflowName: "Production Monitor",
  });

  expect(comment).toContain("Production Monitor");
  expect(comment).toContain("closed automatically");
  expect(comment).toContain("1234567890ab");
});

test("production incident alerts skip superseded cancelled production deploy runs", () => {
  expect(isSupersededCancelledRun({
    branch: "main",
    conclusion: "cancelled",
    currentSha: "fresh-main-sha",
    sha: "older-deploy-sha",
    workflowName: "Production Deploy",
  })).toBe(true);

  expect(isSupersededCancelledRun({
    branch: "main",
    conclusion: "failure",
    currentSha: "fresh-main-sha",
    sha: "older-deploy-sha",
    workflowName: "Production Deploy",
  })).toBe(false);

  expect(isSupersededCancelledRun({
    branch: "main",
    conclusion: "cancelled",
    currentSha: "same-sha",
    sha: "same-sha",
    workflowName: "Production Deploy",
  })).toBe(false);
});
