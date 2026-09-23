import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function functionSource(source, name) {
  const start = source.search(new RegExp(`(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`));
  if (start < 0) {
    failures.push(`Missing ${name}.`);
    return "";
  }
  const next = source.slice(start + 1).search(/\n  (?:function|const)\s/);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

function forbidText(source, text, description) {
  if (source.includes(text)) failures.push(description);
}

const sessionInput = functionSource(read("src/modules/session-planner/session-planner-workspace-input-change-controller.mjs"), "handleInput");
requireText(sessionInput, "recordTextDraft(field)", "Session Planner text input must record a local draft.");
forbidText(sessionInput, "updateSelectedBlockField", "Session Planner text input must not centrally save per keystroke.");

const periodizationInput = functionSource(read("src/modules/periodization/periodization-controller.mjs"), "handleBoardInput");
requireText(periodizationInput, "isTextEditingField(field)", "Periodization must distinguish text input from committed controls.");
requireText(periodizationInput, "recordTextDraft(field)", "Periodization text input must record a local draft.");

const periodizationBridgeInput = functionSource(read("src/modules/periodization/periodization-session-bridge.mjs"), "handleInput");
requireText(periodizationBridgeInput, "recordTextDraft(field)", "Embedded Periodization text input must record a local draft.");

const playerProfileInput = functionSource(read("src/modules/squad/player-profile-runtime-bindings.mjs"), "onInput");
requireText(playerProfileInput, "recordTextDraft(event.target)", "Player Profiles text input must record a local draft.");
forbidText(playerProfileInput, "queuePlayerProfileAutosave", "Player Profiles text input must not centrally save per keystroke.");

const presentationInput = functionSource(read("src/modules/presentation-mode/presentation-mode-controller.mjs"), "handleInput");
requireText(presentationInput, "recordPresentationTextDraft", "Presentation text input must record a local draft.");
forbidText(presentationInput, "updateInfoSlideField", "Presentation text input must not centrally save per keystroke.");
forbidText(presentationInput, "updateTextOverride", "Presentation text input must not centrally save per keystroke.");

if (failures.length) {
  console.error("Text input save policy failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Text input save policy: ok");
}
