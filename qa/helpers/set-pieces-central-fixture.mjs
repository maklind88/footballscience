import { expect } from "@playwright/test";
import { applySetPiecePlayChange, setPiecePlayValue } from "../../src/modules/set-pieces-room/set-pieces-save-protocol.mjs";
import { createSetPiecePlay, normalizeSetPiecesState } from "../../src/modules/set-pieces-room/state.mjs";

export const setPiecesKey = "football-set-pieces-room-v1";
export const manifestKey = "football-data-safety-v1";
export const qaCoach = {
  id: "set-pieces-coach", email: "set-pieces@footballscience.test",
  user_metadata: { firstName: "QA", lastName: "Coach", username: "qa.coach" },
  app_metadata: { role: "admin", status: "active", organizationId: "set-pieces-org" },
};

export function playState(objective = "Team version", id = "shared-play") {
  return normalizeSetPiecesState({ plays: [createSetPiecePlay({ id, title: id, context: "library", objective })] });
}

// Real auth boot, cache, IndexedDB journal and editor; only remote HTTP is synthetic.
export async function installSetPiecesCentralFixture(page, { seed, principalScope = "", viewport, journalDenied = false } = {}) {
  const server = { state: playState(), revision: 10, writes: [], actor: structuredClone(qaCoach), denyWrites: false, absent: false };
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript(({ seed, principalScope, key, manifest, journalDenied }) => {
    window.__footballScienceQaForceCentralState = true;
    localStorage.setItem("football-set-pieces-room-onboarding-v1", "dismissed");
    window.__setPiecesNativeGet = Storage.prototype.getItem;
    window.__setPiecesNativeSet = Storage.prototype.setItem;
    if (journalDenied) {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, ...args) => {
        if (name === "football-science-set-pieces-saves-v1") throw new Error("QA journal unavailable");
        return open(name, ...args);
      };
    }
    if (seed && !localStorage.getItem("qa-set-pieces-seeded")) {
      localStorage.setItem(key, JSON.stringify(seed));
      localStorage.setItem(manifest, JSON.stringify({ entries: { [key]: {
        pendingCentralSync: true, serverRevision: 9, hash: "older-local-draft", principalScope,
      } } }));
      localStorage.setItem("qa-set-pieces-seeded", "1");
    }
  }, { seed, principalScope, key: setPiecesKey, manifest: manifestKey, journalDenied });
  await page.route("**/npm/@supabase/supabase-js@2/**", (route) => route.fulfill({ contentType: "text/javascript", body: `
    window.__qaSetPiecesSession = ${JSON.stringify({ access_token: `qa-set-pieces-token-${server.actor.id}`, user: server.actor })};
    window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: window.__qaSetPiecesSession }, error: null }),
      refreshSession: async () => ({ data: { session: window.__qaSetPiecesSession }, error: null }),
      onAuthStateChange: (fn) => { window.__qaSetPiecesAuth = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } }) };` }));
  await page.route("**/api/client-config", (route) => route.fulfill({ json: {
    ok: true, url: "https://qa.supabase.co", anonKey: "qa-public-key", hasServiceRoleKey: true,
  } }));
  await page.route("**/api/admin-users**", (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.has("me")
    ? { ok: true, user: server.actor } : { ok: true, users: [server.actor], roles: ["admin", "coach"] } }));
  await page.route("**/api/presence**", (route) => route.fulfill({ json: { ok: true, entries: [] } }));
  await page.route("**/api/app-state**", async (route) => {
    if (route.request().method() === "GET") {
      const metadata = { revision: server.revision, organizationId: "set-pieces-org", moduleId: "set-pieces-room" };
      return route.fulfill({ json: { ok: true,
        entries: server.absent ? {} : { [setPiecesKey]: JSON.stringify(server.state) },
        metadata: server.absent ? {} : { [setPiecesKey]: metadata },
        absentKeys: server.absent ? [setPiecesKey] : [],
      } });
    }
    const body = route.request().postDataJSON();
    server.writes.push(body);
    if (body.key !== setPiecesKey) return route.fulfill({ json: { ok: true } });
    if (server.denyWrites) return route.fulfill({ status: 503, json: { ok: false, reason: "QA offline" } });
    if (!body.setPieceChange) return route.fulfill({ status: 400, json: { ok: false, reason: "Expected a play change" } });
    if (body.baseRevision !== server.revision) return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision } });
    const result = applySetPiecePlayChange(server.state, body.setPieceChange);
    if (!result.ok) return route.fulfill({ status: 409, json: { ok: false, currentRevision: server.revision, conflicts: result.conflicts } });
    server.state = result.state;
    server.revision++;
    return route.fulfill({ json: { ok: true, metadata: { revision: server.revision }, setPieceChange: {
      id: body.setPieceChange.id, playId: body.setPieceChange.playId,
      value: setPiecePlayValue(server.state, body.setPieceChange.playId),
    } } });
  });
  return server;
}

export async function waitForSetPieces(page) {
  await expect(page.locator("#hubShell")).toBeVisible();
  await page.waitForFunction(() => window.footballScienceCentralState?.isHydrated?.());
  await expect(page.getByRole("heading", { name: "Set Pieces Room", exact: true })).toBeVisible();
  const introduction = page.getByRole("button", { name: "Close introduction", exact: true });
  if (await introduction.isVisible()) await introduction.click();
}

export async function readSetPiecesRecovery(page) {
  return page.evaluate(async ({ key, manifest }) => {
    const { createOfflineOperationJournal } = await import("/src/core/offline-operation-journal.mjs");
    const journal = createOfflineOperationJournal({ databaseName: "football-science-set-pieces-saves-v1" });
    const archives = await journal.list("unverified-set-pieces-local-recovery");
    await journal.close();
    return {
      disk: window.__setPiecesNativeGet.call(localStorage, key),
      manifest: JSON.parse(window.__setPiecesNativeGet.call(localStorage, manifest)).entries[key],
      archives: archives.map((row) => row.payload.value),
    };
  }, { key: setPiecesKey, manifest: manifestKey });
}
