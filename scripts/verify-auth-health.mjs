import process from "node:process";

const baseUrl = new URL(process.env.LIVE_QA_BASE_URL || process.argv[2] || "https://footballscience.xyz");
const timeoutMs = Number(process.env.AUTH_HEALTH_VERIFY_TIMEOUT_MS || 10_000);

function timeoutSignal(ms) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

const startedAt = Date.now();
try {
  const response = await fetch(new URL("/api/auth-health", baseUrl), {
    cache: "no-store",
    signal: timeoutSignal(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok || payload?.ok !== true) {
    console.error(
      `Auth health failed: status=${response.status} ms=${payload?.ms ?? elapsedMs} reason=${
        payload?.reason || "unknown"
      }`
    );
    process.exitCode = 1;
  } else {
    console.log(`Auth health ok: ${payload.name || "Supabase Auth"} ${payload.version || ""} (${payload.ms ?? elapsedMs}ms)`);
  }
} catch (error) {
  console.error(`Auth health failed: ${error?.name || "Error"} ${error?.message || "unknown error"}`);
  process.exitCode = 1;
}
