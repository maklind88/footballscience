import process from "node:process";

const required = ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());
const timeoutMs = Number(process.env.VERCEL_TOKEN_VERIFY_TIMEOUT_MS || 10000);

if (missing.length) {
  console.error("Vercel deployment token verification failed:");
  missing.forEach((name) => console.error(`- ${name} is missing.`));
  console.error("\nAdd the missing GitHub secret(s) before Vercel deploy, staging, or rollback can run safely.");
  process.exit(1);
}

const token = String(process.env.VERCEL_TOKEN);
const orgId = String(process.env.VERCEL_ORG_ID);
const projectId = String(process.env.VERCEL_PROJECT_ID);

function createTimeoutSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function explainResponse(response, payload, fallback) {
  return payload?.error?.message || payload?.message || fallback || response.statusText || "Unknown Vercel API error";
}

async function requestVercelJson(url, label) {
  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: timeout.signal,
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}: ${explainResponse(response, payload, text.slice(0, 180))}`);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function verify() {
  await requestVercelJson("https://api.vercel.com/v2/user", "Vercel token identity check");

  const projectUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`);
  projectUrl.searchParams.set("teamId", orgId);
  const project = await requestVercelJson(projectUrl, "Vercel project access check");

  if (project?.id && project.id !== projectId) {
    throw new Error(`Vercel project access check returned ${project.id}, expected ${projectId}.`);
  }

  console.log("Vercel deployment token: ok");
}

verify().catch((error) => {
  console.error("Vercel deployment token verification failed:");
  console.error(`- ${error.message}`);
  console.error("\nCreate a long-lived Vercel account token, store it as the GitHub secret VERCEL_TOKEN, and rerun the workflow.");
  process.exitCode = 1;
});
