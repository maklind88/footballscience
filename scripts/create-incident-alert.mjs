import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultLabels = [
  {
    name: "production-incident",
    color: "b60205",
    description: "Production or release workflow needs human attention.",
  },
  {
    name: "release-monitor",
    color: "5319e7",
    description: "Created by automated Football Science release monitoring.",
  },
];

function clean(value) {
  return String(value || "").trim();
}

function shortSha(sha) {
  const value = clean(sha);
  return value ? value.slice(0, 12) : "unknown";
}

function getIncidentContext(env = process.env) {
  const repo = clean(env.GITHUB_REPOSITORY);
  const runUrl =
    clean(env.INCIDENT_RUN_URL) ||
    (repo && clean(env.INCIDENT_RUN_ID)
      ? `${clean(env.GITHUB_SERVER_URL) || "https://github.com"}/${repo}/actions/runs/${clean(env.INCIDENT_RUN_ID)}`
      : "");

  return {
    actor: clean(env.INCIDENT_ACTOR) || clean(env.GITHUB_ACTOR) || "unknown",
    baseUrl: clean(env.LIVE_QA_BASE_URL) || "https://footballscience.xyz",
    branch: clean(env.INCIDENT_HEAD_BRANCH) || clean(env.GITHUB_REF_NAME) || "unknown",
    conclusion: clean(env.INCIDENT_WORKFLOW_CONCLUSION) || "unknown",
    event: clean(env.INCIDENT_EVENT) || clean(env.GITHUB_EVENT_NAME) || "unknown",
    repo,
    runId: clean(env.INCIDENT_RUN_ID) || clean(env.GITHUB_RUN_ID) || "",
    runNumber: clean(env.INCIDENT_RUN_NUMBER) || clean(env.GITHUB_RUN_NUMBER) || "",
    runUrl,
    serverUrl: clean(env.GITHUB_SERVER_URL) || "https://github.com",
    sha: clean(env.INCIDENT_HEAD_SHA) || clean(env.GITHUB_SHA) || "",
    workflowName: clean(env.INCIDENT_WORKFLOW_NAME) || clean(env.GITHUB_WORKFLOW) || "Unknown workflow",
  };
}

function isActionableFailure(conclusion) {
  return !["success", "skipped", "neutral"].includes(clean(conclusion).toLowerCase());
}

function buildIncidentTitle(context) {
  return `Production incident: ${context.workflowName}`;
}

function buildIncidentBody(context) {
  return [
    "## What happened",
    "",
    `The **${context.workflowName}** workflow ended with **${context.conclusion}**.`,
    "",
    "## First response",
    "",
    "1. Open the failed workflow run and read the first failing step.",
    "2. Check the live domain before assuming users are affected.",
    "3. If production is unhealthy, use the manual `Production Rollback` workflow with a known-good deployment.",
    "4. After recovery, confirm `npm run release:postdeploy` and authenticated live smoke pass.",
    "",
    "## Signals",
    "",
    `- Live URL: ${context.baseUrl}`,
    `- Workflow: ${context.workflowName}`,
    `- Conclusion: ${context.conclusion}`,
    `- Branch: ${context.branch}`,
    `- Commit: ${shortSha(context.sha)}`,
    `- Run: ${context.runUrl || "unknown"}`,
    `- Event: ${context.event}`,
    `- Actor: ${context.actor}`,
    "",
    "## Guardrail",
    "",
    "Do not deploy over this incident until the failing signal is understood or an explicit rollback/hotfix path has passed the release gates.",
  ].join("\n");
}

function buildIncidentComment(context) {
  return [
    `Another **${context.workflowName}** run ended with **${context.conclusion}**.`,
    "",
    `- Run: ${context.runUrl || "unknown"}`,
    `- Branch: ${context.branch}`,
    `- Commit: ${shortSha(context.sha)}`,
    `- Actor: ${context.actor}`,
  ].join("\n");
}

async function githubJson(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = payload?.message || response.statusText || "GitHub API error";
    const error = new Error(`${method} ${path} returned ${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function ensureLabels({ repo, token }) {
  for (const label of defaultLabels) {
    const encodedName = encodeURIComponent(label.name);
    try {
      await githubJson(`/repos/${repo}/labels/${encodedName}`, { token });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
      await githubJson(`/repos/${repo}/labels`, {
        method: "POST",
        token,
        body: label,
      });
    }
  }
}

async function findOpenIncidentIssue({ repo, token, title }) {
  const query = new URLSearchParams({
    q: `repo:${repo} is:issue is:open in:title "${title}"`,
    per_page: "10",
  });
  const payload = await githubJson(`/search/issues?${query}`, { token });
  return payload?.items?.find((issue) => issue.title === title) || null;
}

async function createOrUpdateIncidentIssue(context, token) {
  await ensureLabels({ repo: context.repo, token });

  const title = buildIncidentTitle(context);
  const existingIssue = await findOpenIncidentIssue({ repo: context.repo, token, title });

  if (existingIssue?.number) {
    await githubJson(`/repos/${context.repo}/issues/${existingIssue.number}/comments`, {
      method: "POST",
      token,
      body: { body: buildIncidentComment(context) },
    });
    console.log(`Incident alert updated: #${existingIssue.number}`);
    return { action: "updated", number: existingIssue.number, url: existingIssue.html_url };
  }

  const createdIssue = await githubJson(`/repos/${context.repo}/issues`, {
    method: "POST",
    token,
    body: {
      title,
      body: buildIncidentBody(context),
      labels: defaultLabels.map((label) => label.name),
    },
  });

  console.log(`Incident alert created: #${createdIssue.number}`);
  return { action: "created", number: createdIssue.number, url: createdIssue.html_url };
}

export {
  buildIncidentBody,
  buildIncidentComment,
  buildIncidentTitle,
  createOrUpdateIncidentIssue,
  getIncidentContext,
  isActionableFailure,
};

async function main() {
  const context = getIncidentContext();
  const dryRun = process.argv.includes("--dry-run") || process.env.INCIDENT_DRY_RUN === "1";

  if (!isActionableFailure(context.conclusion)) {
    console.log(`Incident alert skipped: ${context.workflowName} concluded ${context.conclusion}.`);
    return;
  }

  if (!context.repo) {
    throw new Error("GITHUB_REPOSITORY is required to create an incident alert.");
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          title: buildIncidentTitle(context),
          body: buildIncidentBody(context),
        },
        null,
        2
      )
    );
    return;
  }

  const token = clean(process.env.GITHUB_TOKEN);
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to create an incident alert.");
  }

  await createOrUpdateIncidentIssue(context, token);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Incident alert failed:");
    console.error(`- ${error.message}`);
    process.exitCode = 1;
  });
}
