import { test, expect } from "@playwright/test";
import { readMedicalRecoveryCentralState, medicalRecoveryMatchesCentral } from "../src/modules/medical/medical-recovery-central-read.mjs";

const key = "football-medical-team-v1", value = '{"records":[{"id":"synthetic"}]}';
function fixture(change = () => {}) {
  const state = { scope: "owner-team", token: "synthetic-token", canRead: true,
    response: { ok: true, payload: { ok: true, entries: { [key]: value }, metadata: { [key]: { revision: 12 } }, medicalRecoveryRead: { private: true } } } };
  change(state); const requests = [];
  const options = { expectedScope: "owner-team", getScope: () => state.scope, getToken: () => state.token, canRead: () => state.canRead,
    path: `/api/app-state?fresh=1&keys=${key}`, apiRequest: async (path, init) => { expect(init.isCurrent()).toBe(true); requests.push({ path, init }); return state.response; } };
  return { state, options, requests };
}

test("recovery proof comes from a fresh private GET with value and revision from the same response", async () => {
  const f = fixture();
  expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: true, private: true, scope: "owner-team", value, revision: 12 });
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0]).toMatchObject({ path: `/api/app-state?fresh=1&keys=${key}`, init: { method: "GET", headers: { "x-footballscience-fresh-state": "1" } } });
  expect(f.requests[0].init.isCurrent()).toBe(false);
});
for (const change of ["scope", "token", "permission"]) {
  test(`a changed ${change} invalidates the in-flight proof`, async () => {
    const f = fixture();
    f.options.apiRequest = async () => {
      if (change === "scope") f.state.scope = "other";
      if (change === "token") f.state.token = "rotated-token";
      if (change === "permission") f.state.canRead = false;
      return f.state.response;
    };
    expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: false });
  });
}
for (const [name, change] of Object.entries({
  "unknown scope": s => { s.scope = ""; }, "foreign scope": s => { s.scope = "other"; },
  "no token": s => { s.token = ""; }, "permission denied": s => { s.canRead = false; },
})) test(`no request when ${name}`, async () => {
  const f = fixture(change);
  expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: false }); expect(f.requests).toEqual([]);
});
for (const [name, change] of Object.entries({
  "HTTP error": s => { s.response.ok = false; }, "payload failure": s => { s.response.payload.ok = false; },
  "old deployment": s => { delete s.response.payload.medicalRecoveryRead; },
  "coach projection": s => { s.response.payload.medicalRecoveryRead.private = false; },
  "omitted key": s => { s.response.payload.entries = {}; }, "removed": s => { s.response.payload.metadata[key].removed = true; },
  "missing revision": s => { s.response.payload.metadata[key] = {}; },
  "zero revision": s => { s.response.payload.metadata[key].revision = 0; },
  "string revision": s => { s.response.payload.metadata[key].revision = "12"; },
})) test(`no verification from ${name}`, async () => {
  const f = fixture(change);
  expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: false });
});
test("transport failure does not disclose private error text", async () => {
  const f = fixture(); f.options.apiRequest = async () => { throw new Error("private token and clinical context"); };
  expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: false });
});

test("exact whole-envelope match is required; revision alone, unknown fields and formatting are never ignored", () => {
  const copy = { scope: "owner-team", value, baseRevision: 10 };
  const proof = { ok: true, private: true, scope: copy.scope, value, revision: 12 };
  expect(medicalRecoveryMatchesCentral(copy, proof)).toBe(true);
  expect(medicalRecoveryMatchesCentral({ ...copy, baseRevision: null }, proof)).toBe(true);
  for (const altered of [{ ...proof, value: value + " " }, { ...proof, value: '{"records":[]}' }, { ...proof, revision: 9 },
    { ...proof, scope: "other" }, { ...proof, private: false }, { ...proof, revision: Infinity }]) {
    expect(medicalRecoveryMatchesCentral(copy, altered)).toBe(false);
  }
});


test("a stalled full response expires and its late response cannot verify a copy", async () => {
  const f = fixture(); let complete, current;
  f.options.timeoutMs = 10;
  f.options.apiRequest = (_path, init) => {
    current = init.isCurrent;
    return new Promise(resolve => { complete = resolve; });
  };
  expect(await readMedicalRecoveryCentralState(f.options)).toEqual({ ok: false });
  expect(current()).toBe(false);
  complete(f.state.response);
  await Promise.resolve();
  expect(current()).toBe(false);
});
