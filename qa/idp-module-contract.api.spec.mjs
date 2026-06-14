import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildIdpDashboardFromSquadState, buildLegacyPlayerDetail } from "../src/modules/idp/idp-adapter.mjs";
import { renderIdpWorkspace } from "../src/modules/idp/idp-renderer.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = path.join(rootDir, "src/modules/idp");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("idp module keeps the required isolated file structure", () => {
  for (const relativePath of [
    "src/modules/idp/index.mjs",
    "src/modules/idp/idp-actions.mjs",
    "src/modules/idp/idp-adapter.mjs",
    "src/modules/idp/idp-renderer.mjs",
    "src/modules/idp/idp-state.mjs",
    "src/modules/idp/idp.css",
    "src/modules/idp/constants/idp-options.mjs",
    "src/modules/idp/domain/idp.models.mjs",
    "src/modules/idp/services/idp-api-service.mjs",
  ]) {
    expect(fs.existsSync(path.join(rootDir, relativePath)), relativePath).toBe(true);
  }
});

test("idp UI modules avoid direct database access and use only the API service for network calls", () => {
  for (const file of fs.readdirSync(moduleDir).filter((entry) => entry.endsWith(".mjs"))) {
    const source = read(`src/modules/idp/${file}`);
    expect(source, file).not.toMatch(/supabase|service_role|SUPABASE|from\(["'`]/i);
    if (file !== "idp-actions.mjs") {
      expect(source, file).not.toMatch(/fetch\(/);
    }
  }

  expect(read("src/modules/idp/services/idp-api-service.mjs")).toContain("/api/idp");
  expect(read("api/idp.js")).toContain('route: "/api/idp"');
  expect(read("api/idp.js")).toContain('moduleId: "idp"');
});

test("idp renderer exposes dashboard, player detail, and command surfaces", () => {
  const html = renderIdpWorkspace({
    ui: { statusFilter: "All", categoryFilter: "All", searchQuery: "" },
    dashboardPlayers: [
      {
        profile: { playerId: "p1", playerName: "Player One", position: "FW", role: "9" },
        focus: { title: "Receive under pressure", category: "Tactical", status: "Active" },
        evidenceCount: 1,
        newClipCount: 2,
        overallStatus: "New Clips To Review",
        nextAction: "Review clip bank",
      },
    ],
    playerDetail: buildLegacyPlayerDetail({
      id: "p1",
      name: "Player One",
      position: "FW",
      primaryRole: "9",
      idp: { primaryFocus: "Receive under pressure", nextAction: "Add evidence" },
    }),
  }, { canEdit: true });

  expect(html).toContain("data-idp-player=\"p1\"");
  expect(html).toContain("data-idp-filter=\"status\"");
  expect(html).toContain("data-idp-create-focus");
  expect(html).toContain("data-idp-add-evidence");
  expect(html).toContain("Clip Bank");
  expect(html).toContain("Development Timeline");
});

test("idp adapter derives read-only fallback from Squad state", () => {
  const dashboard = buildIdpDashboardFromSquadState({
    players: [
      {
        id: "p1",
        name: "Player One",
        position: "CM",
        primaryRole: "8",
        idp: { primaryFocus: "Scan before receive", nextAction: "Add evidence" },
      },
      { id: "p2", name: "Hidden Player", countsInSquad: false },
    ],
  });

  expect(dashboard).toHaveLength(1);
  expect(dashboard[0].profile).toMatchObject({ playerId: "p1", playerName: "Player One" });
  expect(dashboard[0].focus.title).toBe("Scan before receive");
  expect(dashboard[0].nextAction).toBe("Add evidence");
});

test("fs player syncs saved player clips to idp clip bank through the server boundary", () => {
  const videoApi = read("api/_lib/video-analysis-database.js");
  expect(videoApi).toContain('require("./idp-database.js")');
  expect(videoApi).toContain("syncClipPlayersToIdp");
  expect(videoApi).toContain("upsertClipBankItem");
  expect(videoApi).toContain("idpClipBank");
});

test("idp module exports the workspace runtime handlers", async () => {
  const module = await import(pathToFileURL(path.join(moduleDir, "index.mjs")).href);
  for (const exportName of ["render", "handleClick", "handleInput", "handleChange", "handleSubmit"]) {
    expect(typeof module[exportName], exportName).toBe("function");
  }
});
