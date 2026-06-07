import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  architectureSizeBudgets,
  architectureSizeTargets,
} from "../src/core/architecture-size-targets.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".js", ".mjs", ".css"]);

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const source = fs.readFileSync(filePath, "utf8");
  if (!source) return 0;
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function relative(filePath) {
  return path.relative(rootDir, filePath);
}

const failures = [];
const warnings = [];

const appJsLines = countLines(path.join(rootDir, "app.js"));
if (appJsLines > architectureSizeBudgets.hardCeilings.appJsMaxLines) {
  failures.push(
    `app.js has ${appJsLines} lines; max is ${architectureSizeBudgets.hardCeilings.appJsMaxLines}. Keep app.js as a thin shell.`
  );
}

const appRuntimeLines = countLines(path.join(rootDir, "app-runtime.js"));
if (appRuntimeLines > architectureSizeBudgets.hardCeilings.appRuntimeTransitionMaxLines) {
  failures.push(
    `app-runtime.js has ${appRuntimeLines} lines; transition ceiling is ${architectureSizeBudgets.hardCeilings.appRuntimeTransitionMaxLines}. Move new code into modules.`
  );
}
if (appRuntimeLines > architectureSizeBudgets.warnings.appRuntimeTargetWarningLines) {
  warnings.push(
    `app-runtime.js is ${appRuntimeLines} lines; target is 1,500-3,000 and warning starts above 5,000-6,000.`
  );
}

const largeModuleFiles = walkFiles(path.join(rootDir, "src", "modules"))
  .map((filePath) => ({ file: relative(filePath), lines: countLines(filePath) }))
  .filter((item) => item.lines > architectureSizeBudgets.warnings.moduleFileWarningLines)
  .sort((a, b) => b.lines - a.lines);

if (largeModuleFiles.length) {
  warnings.push(
    `${largeModuleFiles.length} module file(s) exceed ${architectureSizeBudgets.warnings.moduleFileWarningLines} lines. Largest: ${largeModuleFiles
      .slice(0, 10)
      .map((item) => `${item.file} (${item.lines})`)
      .join(", ")}.`
  );
}

console.log("Architecture size budgets");
for (const target of architectureSizeTargets) {
  console.log(`- ${target.area}: ideal ${target.ideal}; warning ${target.warning}`);
}
console.log(`\nCurrent shell sizes: app.js ${appJsLines} lines, app-runtime.js ${appRuntimeLines} lines.`);

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nArchitecture size guard passed.");
