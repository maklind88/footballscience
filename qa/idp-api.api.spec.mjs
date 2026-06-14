import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const api = require("../api/_lib/idp-database.js");
const core = require("../api/_lib/idp-database-core.js");

const actor = {
  id: "coach-1",
  clubId: "club-ncc",
  teamId: "team-ncc-first",
};

function createJsonResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(value) {
      this.body = value;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

test("idp status endpoint is server-owned and does not require database access", async () => {
  const res = createJsonResponse();
  await api.handleIdpRequest({ method: "GET", url: "/api/idp?action=status" }, res, actor);
  const payload = JSON.parse(res.body);

  expect(res.statusCode).toBe(200);
  expect(payload).toMatchObject({
    ok: true,
    schema: api.IDP_SCHEMA,
    mode: "player-development-system",
    ownsPlayerIdentity: false,
    ownsClipMetadata: false,
    evidenceIsCurated: true,
  });
  expect(payload.scope).toMatchObject({ organizationId: "club-ncc", teamId: "team-ncc-first" });
});

test("idp dashboard status prioritizes clips, evidence gaps, review dates, and completion", () => {
  expect(api.dashboardStatus({}, null, 0)).toBe("No Active Focus");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Has Evidence" }, 2)).toBe("New Clips To Review");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Needs Evidence" }, 0)).toBe("Needs Evidence");
  expect(api.dashboardStatus({}, { status: "Active", evidence_status: "Has Evidence", review_date: "2000-01-01" }, 0)).toBe("Review Due");
  expect(api.dashboardStatus({}, { status: "Completed", evidence_status: "Has Evidence" }, 0)).toBe("Completed");
});

test("idp normalization keeps scope bounded and safe", () => {
  expect(api.normalizeCategory("Technical")).toBe("Technical");
  expect(api.normalizeCategory("unknown category")).toBe("Tactical");
  expect(core.normalizeUuid("2a4e615e-f3e7-4fc7-bb70-a02db63c9152")).toBe("2a4e615e-f3e7-4fc7-bb70-a02db63c9152");
  expect(core.normalizeUuid("not-a-uuid")).toBe("");
  expect(core.actorScope({ id: "coach-2", teamId: "team-a" })).toMatchObject({
    actorId: "coach-2",
    organizationId: "club-ncc",
    teamId: "team-a",
  });
});

test("idp api exposes a server-owned assignment action", () => {
  const source = fs.readFileSync(new URL("../api/_lib/idp-database.js", import.meta.url), "utf8");
  expect(source).toContain('action === "assign-owner"');
  expect(source).toContain("primary_owner_id");
  expect(source).toContain("idp_staff_ownership");
  expect(typeof api.assignOwner).toBe("function");
});
