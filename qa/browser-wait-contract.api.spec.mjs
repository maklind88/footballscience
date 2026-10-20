import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDir = path.dirname(fileURLToPath(import.meta.url));

// Direct async predicates can resolve to false without polling in Playwright 1.59.1.
// Use expect.poll with page.evaluate when readiness requires asynchronous work.
test("QA browser waits do not pass direct async predicates to waitForFunction", () => {
  const offenders = [];
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.[cm]?js$/.test(entry.name) && /\.\s*waitForFunction\s*\(\s*async\b/m.test(readFileSync(file, "utf8"))) {
        offenders.push(path.relative(qaDir, file));
      }
    }
  }
  inspect(qaDir);
  expect(offenders, "Await the resolved result with expect.poll instead").toEqual([]);
});
