import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionPlannerRuntimeService } from "../src/modules/session-planner/index.mjs";

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

test("Session Planner runtime service owns controller composition outside app-runtime", () => {
  const app = readProjectFile("app-runtime.js");
  const accessors = readProjectFile("src/modules/session-planner/session-planner-runtime-accessors.mjs");
  const composer = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const service = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");
  const index = readProjectFile("src/modules/session-planner/index.mjs");

  expect(typeof createSessionPlannerRuntimeService).toBe("function");
  expect(app).toContain("createWorkspaceRuntimeComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(workspaceComposer).toContain("createSessionPlannerRuntimeServiceComposition({");
  expect(app).not.toContain("createSessionPlannerRuntimeService({");
  expect(composer).toContain("createSessionPlannerRuntimeService({");
  expect(composer).toContain("createSessionPlannerStateMergeHelpers({");
  expect(composer).toContain("createSessionPlannerToastController({");
  expect(app).not.toContain("createSessionPlannerRuntimeStateService({");
  expect(app).not.toContain("createSessionPlannerBoardHistoryController({");
  expect(app).not.toContain("createSessionPlannerWorkspaceController({");
  expect(app).toContain("configureSessionPlannerRuntimeAccessors(() => ({");
  expect(app).toContain("runtimeStateService: sessionPlannerRuntimeStateService");
  expect(accessors).toContain("function writeSessionPlannerState(...args)");
  expect(app).toContain("sessionPlannerWorkspaceController = composedSessionPlannerWorkspaceController;");
  expect(service).toContain("createSessionPlannerRuntimeStateService({");
  expect(service).toContain("createSessionPlannerBoardHistoryController({");
  expect(service).toContain("createSessionPlannerWorkspaceController({");
  expect(service).toContain("runtimeRenderers");
  expect(service).toContain("stateMergeHelpers");
  expect(service).toContain("exerciseLibraryRuntimeFacade");
  expect(index).toContain('export * from "./session-planner-runtime-service.mjs";');
  expect(index).toContain('export * from "./session-planner-runtime-service-composer.mjs";');
});

test("Session Planner runtime service does not own raw save implementations", () => {
  const service = readProjectFile("src/modules/session-planner/session-planner-runtime-service.mjs");

  expect(service).not.toContain("function writeState()");
  expect(service).not.toContain("localStorage.setItem");
  expect(service).not.toContain("rawDataSafetySetItem(");
  expect(service).toContain("rawDataSafetySetItem: deps.rawDataSafetySetItem");
  expect(service).toContain("writeSessionPlannerState");
});

test("Session Planner runtime service receives every dependency it consumes", () => {
  const workspaceComposer = readProjectFile("src/core/workspace-runtime-composer.mjs");
  const composer = readProjectFile("src/modules/session-planner/session-planner-runtime-service-composer.mjs");
  const appServiceCall = extractObjectAfter(workspaceComposer, "createSessionPlannerRuntimeServiceComposition({");
  const providedDependencies = new Set(getTopLevelPropertyNames(appServiceCall));
  const consumedDependencies = new Set(
    Array.from(composer.matchAll(/deps\.([A-Za-z_$][\w$]*)/g), (match) => match[1])
  );

  const missingDependencies = Array.from(consumedDependencies)
    .filter((key) => !providedDependencies.has(key))
    .sort();

  expect(missingDependencies).toEqual([]);
});
