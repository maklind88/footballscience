import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const stagingOrigin = "https://staging.footballscience.xyz";
const stagingRef = "pokrksgempkuraueglpu";
const origin = new URL(process.env.LIVE_QA_BASE_URL || "https://footballscience.xyz").origin;

test("IDP staging persists independent exercises and selected focus links", async ({ request }) => {
  test.skip(origin !== stagingOrigin, "Write proof is restricted to the separate staging database.");
  test.setTimeout(180_000);
  const configResponse = await request.get(`${origin}/api/client-config`);
  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  expect(new URL(config.url).hostname).toBe(`${stagingRef}.supabase.co`);
  expect(process.env.STAGING_SUPABASE_PROJECT_REF).toBe(stagingRef);
  expect(Boolean(process.env.LIVE_QA_USERNAME && process.env.LIVE_QA_PASSWORD)).toBeTruthy();

  const login = await request.post(`${origin}/api/client-config`, {
    data: { email: process.env.LIVE_QA_USERNAME, password: process.env.LIVE_QA_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const session = (await login.json()).session;
  expect(Boolean(session?.access_token)).toBeTruthy();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const playerId = `qa-idp-persistence-${randomUUID()}`;
  console.log(`IDP staging fixture: ${playerId}`);
  const read = async () => {
    const response = await request.get(`${origin}/api/idp?action=player&playerId=${playerId}`, { headers });
    expect(response.ok(), `IDP read status ${response.status()}`).toBeTruthy();
    return response.json();
  };
  const write = async (action, payload) => {
    const response = await request.post(`${origin}/api/idp`, { headers, data: { action, playerId, ...payload } });
    const result = await response.json();
    expect(response.ok(), `${action}: ${response.status()} ${result.reason || ""}`).toBeTruthy();
    return result;
  };

  try {
    expect((await read()).profile).toBeNull();
    const main = (await write("create-focus", { title: "QA main", focusLevel: "main", category: "Technical" })).focus;
    const supporting = (await write("create-focus", { title: "QA supporting", focusLevel: "secondary", category: "Technical" })).focus;
    const goal = (await write("create-goal", { title: "QA goal", focusId: supporting.id })).goal;
    expect(goal.focus_id).toBe(supporting.id);
    const created = (await write("create-intervention", {
      title: "QA free exercise",
      boardState: { tacticalElements: [{ id: "qa-cone", type: "cone", x: 20, y: 30 }] },
    })).intervention;
    expect(created.focus_id).toBeNull();
    let current = created;
    for (const focusId of [main.id, supporting.id, null]) {
      current = (await write("update-intervention", {
        id: current.id, rowVersion: current.row_version, focusId, title: "QA renamed exercise",
      })).intervention;
      const stored = (await read()).interventions.find((item) => item.id === created.id);
      expect(stored.focus_id).toBe(focusId);
      expect(stored.title).toBe("QA renamed exercise");
      expect(stored.board_state).toEqual(created.board_state);
    }
    const stale = await request.post(`${origin}/api/idp`, {
      headers, data: { action: "update-intervention", playerId, id: current.id, rowVersion: created.row_version, title: "stale" },
    });
    expect(stale.status()).toBe(409);
    const final = await read();
    expect(final.focuses.find((focus) => focus.id === main.id).title).toBe("QA main");
    expect(final.goals.find((item) => item.id === goal.id).focus_id).toBe(supporting.id);
    expect(final.interventions).toHaveLength(1);
  } finally {
    // Cleanup uses only the random fixture's IDs and normal soft-delete APIs.
    const fixture = await read();
    for (const row of fixture.interventions || []) {
      await write("archive-intervention", { id: row.id, rowVersion: row.row_version });
    }
    for (const row of fixture.goals || []) {
      await write("archive-goal", { id: row.id, rowVersion: row.row_version });
    }
    for (const row of fixture.focuses || []) {
      await write("delete-focus", { id: row.id, rowVersion: row.row_version });
    }
    const cleaned = await read();
    expect(cleaned.interventions).toHaveLength(0);
    expect(cleaned.focuses).toHaveLength(0);
    expect(cleaned.goals.every((goal) => goal.status === "archived")).toBeTruthy();
  }
});
