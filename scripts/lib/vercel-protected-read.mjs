import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyCanonicalVercelProjectLink } from "./vercel-project-link.mjs";

const runFile = promisify(execFile);
const allowedPaths = new Set([
  "/api/client-config", "/app.js", "/app-runtime.js",
  "/src/modules/platform/navigation-controller.mjs",
]);

// Authenticate only known release probes. Never forward credentials across redirects.
export function createProtectedReleaseFetch({
  fetchImpl = fetch, run = runFile, env = process.env, rootDir = process.cwd(),
  verifyLink = verifyCanonicalVercelProjectLink,
} = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      throw new Error("Release probes require an HTTPS URL without credentials or a custom port.");
    }
    const response = await fetchImpl(url, {
      ...options, redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    const protectedStatus = [301, 302, 303, 307, 308, 401, 403].includes(response.status);
    if (!protectedStatus) return response;
    if (!url.hostname.endsWith(".vercel.app") || !allowedPaths.has(url.pathname)
      || (options.method && options.method !== "GET") || options.body || options.headers) {
      throw new Error(`Release probe refused redirect or denied response from ${url.hostname}.`);
    }
    verifyLink({ rootDir, repairFromFallback: false });
    const args = ["--yes", "vercel@53.2.0", "curl", url.pathname + url.search,
      "--deployment", url.origin];
    if (env.VERCEL_TOKEN) args.push("--token", env.VERCEL_TOKEN);
    if (env.VERCEL_ORG_ID) args.push("--scope", env.VERCEL_ORG_ID);
    args.push("--", "--silent", "--show-error", "--max-time", "30",
      "--proto", "=https", "--no-location", "--max-redirs", "0", "--write-out", "\n%{http_code}");
    let stdout;
    try {
      ({ stdout } = await run("npx", args, {
        cwd: rootDir, env, encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
      }));
    } catch {
      // CLI errors can include command arguments and credentials. Do not expose them.
      throw new Error(`Authenticated release probe failed for ${url.hostname}${url.pathname}.`);
    }
    const separator = stdout.lastIndexOf("\n");
    const status = stdout.slice(separator + 1).trim();
    if (separator < 0 || !/^2\d\d$/.test(status)) {
      throw new Error(`Authenticated release probe returned a non-success response for ${url.hostname}.`);
    }
    return new Response(stdout.slice(0, separator), { status: Number(status) });
  };
}

export function supabaseRefFromConfig(payload) {
  let url;
  try { url = new URL(payload?.url); } catch {
    throw new Error("Client config has a missing or invalid Supabase URL.");
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (!match || url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Client config has an invalid Supabase URL.");
  }
  return match[1];
}

export async function readReleaseClientConfig(fetchImpl, url) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Client config request failed (${response.status}).`);
  let payload;
  try { payload = await response.json(); } catch {
    throw new Error("Client config must be JSON, not a login page or malformed response.");
  }
  supabaseRefFromConfig(payload);
  return payload;
}
