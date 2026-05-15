import process from "node:process";
import { createRequire } from "node:module";
import {
  assertPlatformReadinessContract,
  createPlatformReadinessReport,
  platformReadinessStatuses,
} from "../src/core/platform-readiness-contracts.mjs";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const requiredEnv = process.argv.includes("--required-env");

const report = createPlatformReadinessReport({
  env: process.env,
  scripts: packageJson.scripts || {},
});

assertPlatformReadinessContract({
  env: process.env,
  scripts: packageJson.scripts || {},
});

const missingEnvironment = report.environment.filter((entry) => entry.status === platformReadinessStatuses.missing);
const warningEnvironment = report.environment.filter((entry) => entry.status === platformReadinessStatuses.warning);

console.log("Platform readiness verification: ok");
console.log(`- sections: ${report.summary.readySections}/${report.summary.totalSections} ready`);
console.log(`- modules: ${report.summary.totalModules} mapped`);
console.log(`- protected storage keys: ${report.summary.protectedStorageKeys}`);

for (const entry of warningEnvironment) {
  console.warn(`Platform readiness warning: ${entry.label} missing recommended ${entry.missingRecommended.join(", ")}`);
}

if (missingEnvironment.length) {
  for (const entry of missingEnvironment) {
    console.warn(`Platform readiness missing env: ${entry.label} needs ${entry.missing.join(", ")}`);
  }
  if (requiredEnv) {
    console.error("Platform readiness environment verification failed.");
    process.exitCode = 1;
  }
}
