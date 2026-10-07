import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as medicalOptions from "../src/modules/medical/medical-options.mjs";
import { createMedicalRuntimeService } from "../src/modules/medical/index.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function extractObjectAfter(source, needle) {
  const start = source.indexOf(needle);
  expect(start, `${needle} should exist`).toBeGreaterThanOrEqual(0);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  let inString = "";
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  throw new Error(`${needle} object was not closed`);
}

function getTopLevelPropertyNames(objectSource) {
  const entries = [];
  let depth = 0;
  let inString = "";
  let escaped = false;
  let token = "";

  for (let index = 0; index < objectSource.length; index += 1) {
    const char = objectSource[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = "";
      }
      token += char;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      inString = char;
      token += char;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") {
      depth += 1;
      token += char;
      continue;
    }
    if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
      token += char;
      continue;
    }
    if (depth === 0 && char === ",") {
      if (token.trim()) {
        entries.push(token.trim());
      }
      token = "";
      continue;
    }
    token += char;
  }
  if (token.trim()) {
    entries.push(token.trim());
  }

  return entries
    .map((entry) => entry.match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1] || entry.match(/^([A-Za-z_$][\w$]*)$/)?.[1])
    .filter(Boolean);
}

test("Medical runtime service owns composition wiring outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/medical/medical-runtime-accessors.mjs");
  const composer = readProjectFile("src/modules/medical/medical-runtime-service-composer.mjs");
  const service = readProjectFile("src/modules/medical/medical-runtime-service.mjs");
  const index = readProjectFile("src/modules/medical/index.mjs");

  expect(typeof createMedicalRuntimeService).toBe("function");
  expect(app).toContain("createMedicalRuntimeServiceComposition({");
  expect(app).not.toContain("createMedicalRuntimeService({");
  expect(composer).toContain("createMedicalRuntimeService({");
  expect(app).not.toContain("createMedicalRuntimeRenderers({");
  expect(app).not.toContain("createMedicalRuntimeHelpers({");
  expect(app).not.toContain("createMedicalRuntimeStateService({");
  expect(app).not.toContain("createMedicalRuntimeFacade({");
  expect(app).toContain("configureMedicalRuntimeAccessors(() => medicalRuntimeService);");
  expect(accessors).toContain('export function addMedicalRecord(...args) { return callFacade("addMedicalRecord", args); }');
  expect(accessors).toContain('export function renderMedicalTeamWorkspace(...args) { return callFacade("renderMedicalTeamWorkspace", args); }');
  expect(service).toContain("createMedicalRuntimeRenderers({");
  expect(service).toContain("createMedicalRuntimeHelpers({");
  expect(service).toContain("createMedicalRuntimeStateService({");
  expect(service).toContain("createMedicalRuntimeFacade({");
  expect(service).toContain("fetchRef: deps.fetchRef");
  expect(service).toContain("getPlatformApiAccessToken: deps.getPlatformApiAccessToken");
  expect(service).toContain("get helpers() { return getHelpers(); }");
  expect(service).toContain("get stateService() { return getStateService(); }");
  expect(service).toContain("get facade() { return getFacade(); }");
  expect(service).toContain('withMedicalStateReadBatch: fromStateService("withMedicalStateReadBatch")');
  expect(index).toContain('export * from "./medical-runtime-service.mjs";');
  expect(index).toContain('export * from "./medical-runtime-service-composer.mjs";');
  expect(index).toContain('export * from "./medical-runtime-accessors.mjs";');
});

test("Medical runtime service preserves protected write ownership", () => {
  const service = readProjectFile("src/modules/medical/medical-runtime-service.mjs");

  expect(service).not.toContain("function addMedicalRecord(values");
  expect(service).not.toContain("function writeMedicalState(");
  expect(service).not.toContain("localStorage");
  expect(service).not.toContain("rawDataSafetySetItem(");
  expect(service).toContain("rawDataSafetySetItem: deps.rawDataSafetySetItem");
  expect(service).toContain('fromStateService("writeMedicalState")');
});

test("Medical runtime service composition receives every dependency it consumes", () => {
  const app = readProjectFile("app-runtime.js");
  const composer = readProjectFile("src/modules/medical/medical-runtime-service-composer.mjs");
  const appServiceCall = extractObjectAfter(app, "createMedicalRuntimeServiceComposition({");
  const providedDependencies = new Set(getTopLevelPropertyNames(appServiceCall));
  const consumedDependencies = new Set(
    Array.from(composer.matchAll(/deps\.([A-Za-z_$][\w$]*)/g), (match) => match[1])
  );

  const missingDependencies = Array.from(consumedDependencies)
    .filter((key) => !providedDependencies.has(key))
    .sort();

  expect(missingDependencies).toEqual([]);
});

function coldMedicalRuntime() {
  const fixture = {
    rosterVersion: "qa-cold-start", selectedDate: "2026-10-05", selectedPlayerId: "qa-player",
    players: [{ id: "qa-player", name: "QA Player", position: "Midfielder" }],
    records: [{ id: "qa-record", playerId: "qa-player", date: "2026-10-05",
      participation: 50, actualParticipation: "not-logged", status: "controlled",
      createdAt: "2026-10-05T12:00:00Z" }], injuryPlans: [],
  };
  const stored = JSON.stringify(fixture);
  const writes = [];
  let state = null;
  const service = createMedicalRuntimeService({
    ...medicalOptions,
    medicalTeamStorageKey: "qa-medical", medicalDefaultRosterVersion: "qa-cold-start",
    isMedicalDateValue: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
    formatDateValue: () => "2026-10-05",
    canEditMedicalTeam: () => true,
    getCurrentPlatformUser: () => ({ id: "qa-actor" }),
    getCurrentUser: () => ({ id: "qa-actor" }),
    getMedicalState: () => state, setMedicalState: value => { state = value; },
    getScheduleEventsForDate: () => [{ type: "training", title: "QA training" }],
    isScheduleSessionEvent: event => event.type === "training",
    win: { localStorage: { getItem: () => stored, setItem: (...args) => writes.push(args) } },
  });
  return { service, writes };
}

test("Medical cold state read preserves stored recommendations before helpers are accessed", () => {
  const { service, writes } = coldMedicalRuntime();
  const state = service.stateService.readMedicalState();
  expect(state.players.map(player => player.id)).toEqual(["qa-player"]);
  expect(state.records.map(record => [record.id, record.date, record.participation]))
    .toEqual([["qa-record", "2026-10-05", 50]]);
  expect(writes).toEqual([]);
});

test("Medical cold selector initializes its state and exposes the saved recommendation to consumers", () => {
  const { service, writes } = coldMedicalRuntime();
  const record = service.facade.getLatestMedicalRecord("qa-player", "2026-10-05");
  expect(record).toMatchObject({ id: "qa-record", playerId: "qa-player", date: "2026-10-05", participation: 50 });
  expect(writes).toEqual([]);
});

test("Medical cold normalizer resolves activity dependencies for a legacy record without an RTP phase", () => {
  const { service } = coldMedicalRuntime();
  const record = service.helpers.normalizeMedicalRecord({ id: "qa-legacy", playerId: "qa-player",
    date: "2026-10-05", participation: 50, createdAt: "2026-10-05T12:00:00Z" });
  expect(record).toMatchObject({ id: "qa-legacy", date: "2026-10-05", participation: 50 });
  expect(medicalOptions.medicalRtpPhaseOptions.some(phase => phase.key === record.rtpPhase)).toBe(true);
});
