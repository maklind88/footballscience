import process from "node:process";

function envValue(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function endpointUrl() {
  const baseUrl = envValue("LIVE_QA_BASE_URL") || "https://footballscience.xyz";
  return new URL("/api/platform-health-history", baseUrl).toString();
}

function isRequired() {
  return ["1", "true", "yes", "on"].includes(String(process.env.PLATFORM_HEALTH_SNAPSHOT_REQUIRED || "").trim().toLowerCase());
}

function finishOptional(message) {
  if (isRequired()) {
    console.error(message);
    process.exitCode = 1;
    return;
  }
  console.warn(`${message} Continuing because PLATFORM_HEALTH_SNAPSHOT_REQUIRED is not enabled.`);
}

const token = envValue("PLATFORM_HEALTH_SNAPSHOT_TOKEN", "CRON_SECRET", "APP_STATE_BACKUP_STATUS_TOKEN");
if (!token) {
  finishOptional("Platform health snapshot token is missing.");
} else {
  try {
    const response = await fetch(endpointUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      finishOptional(`Platform health snapshot failed (${response.status}): ${payload.reason || "unknown error"}.`);
    } else {
      const summary = payload.snapshot?.summary || {};
      console.log(
        `Platform health snapshot stored: ${summary.ready || 0}/${summary.total || 0} ready, ${summary.warning || 0} warning, ${summary.missing || 0} missing.`
      );
    }
  } catch (error) {
    finishOptional(`Platform health snapshot request failed: ${error?.message || "unknown error"}.`);
  }
}
