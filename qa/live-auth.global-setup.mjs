import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const authStatePath = path.resolve(qaDir, "..", ".playwright", "auth", "live.json");
const emptyAuthState = { cookies: [], origins: [] };

function isLocalAuthHost(baseURL) {
  const hostname = new URL(baseURL).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function ensureAuthStateDirectory() {
  const directory = path.dirname(authStatePath);
  fs.mkdirSync(directory, { recursive: true });
}

function writeAuthState(state) {
  ensureAuthStateDirectory();
  fs.writeFileSync(authStatePath, JSON.stringify(state));
}

async function loginWithApiBackedSession(page, baseURL) {
  const response = await page.request.post(`${baseURL}/api/client-config`, {
    data: {
      email: process.env.LIVE_QA_USERNAME,
      password: process.env.LIVE_QA_PASSWORD,
    },
    timeout: 45_000,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok() || !payload?.session?.access_token) {
    throw new Error(`API login failed: ${response.status()} ${payload?.reason || payload?.message || "no reason"}`);
  }

  const setSessionResult = await page.evaluate(async (nextSession) => {
    const client = window.platformAuthStore?.getSupabaseClient?.();
    if (!client?.auth?.setSession) {
      return "missing supabase client";
    }
    const { error } = await client.auth.setSession({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
    });
    if (error) {
      return error.message || "setSession failed";
    }
    return "ok";
  }, payload.session);

  if (setSessionResult !== "ok") {
    throw new Error(`Could not restore session in browser: ${setSessionResult}`);
  }

  await page.waitForFunction(
    () => window.platformAuthStore?.getAccessToken && window.__footballScienceAppReady,
    null,
    { timeout: 20_000 }
  );
}

export default async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz";
  const useLiveAuth = Boolean(process.env.LIVE_QA_USERNAME && process.env.LIVE_QA_PASSWORD);
  const isLocalHost = isLocalAuthHost(baseURL);

  if (isLocalHost || !useLiveAuth) {
    if (!fs.existsSync(authStatePath)) {
      writeAuthState(emptyAuthState);
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.platformAuthStore?.getSupabaseClient?.(), { timeout: 20_000 });
    await loginWithApiBackedSession(page, baseURL);
    await page.context().storageState({ path: authStatePath });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}
