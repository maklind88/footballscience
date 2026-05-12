import { expect, test } from "@playwright/test";
import { createPlatformModuleLoader, normalizeAssetHref } from "../src/core/platform-module-loader.mjs";

function createFakeDocument() {
  const elementsById = new Map();
  const appended = [];
  const documentRef = {
    head: {
      appendChild(element) {
        appended.push(element);
        if (element.id) {
          elementsById.set(element.id, element);
        }
        queueMicrotask(() => element.onload?.());
        return element;
      },
    },
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
        onload: null,
        onerror: null,
      };
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    appended,
  };
  return documentRef;
}

test("normalizes versioned asset hrefs without double-versioning", () => {
  expect(normalizeAssetHref("dashboard-chat.css", "123")).toBe("dashboard-chat.css?v=123");
  expect(normalizeAssetHref("dashboard-chat.css?mode=dark", "123")).toBe("dashboard-chat.css?mode=dark&v=123");
  expect(normalizeAssetHref("dashboard-chat.css?v=old", "123")).toBe("dashboard-chat.css?v=old");
  expect(normalizeAssetHref("dashboard-chat.css", "")).toBe("dashboard-chat.css");
});

test("deduplicates stylesheet and script loads", async () => {
  const documentRef = createFakeDocument();
  const loader = createPlatformModuleLoader({ documentRef, assetVersion: "asset-1" });

  const stylesheetA = loader.loadStylesheet("chat-css", "dashboard-chat.css", { id: "chat-css" });
  const stylesheetB = loader.loadStylesheet("chat-css", "dashboard-chat.css", { id: "chat-css" });
  const scriptA = loader.loadScript("periodization-data", "periodization-import-data.js", {
    id: "periodization-data",
  });
  const scriptB = loader.loadScript("periodization-data", "periodization-import-data.js", {
    id: "periodization-data",
  });

  await expect(stylesheetA).resolves.toMatchObject({
    id: "chat-css",
    href: "dashboard-chat.css?v=asset-1",
    rel: "stylesheet",
  });
  await expect(scriptA).resolves.toMatchObject({
    id: "periodization-data",
    src: "periodization-import-data.js?v=asset-1",
    async: true,
  });
  expect(stylesheetA).toBe(stylesheetB);
  expect(scriptA).toBe(scriptB);
  expect(documentRef.appended).toHaveLength(2);
});

test("deduplicates dynamic module imports and retries after failure", async () => {
  const loader = createPlatformModuleLoader();
  let calls = 0;
  const importer = () => {
    calls += 1;
    return Promise.resolve({ loaded: true });
  };

  const first = loader.loadModule("game-simulator.controllers", importer);
  const second = loader.loadModule("game-simulator.controllers", importer);
  await expect(first).resolves.toEqual({ loaded: true });
  await expect(second).resolves.toEqual({ loaded: true });
  expect(first).toBe(second);
  expect(calls).toBe(1);

  let failedCalls = 0;
  const failingImporter = () => {
    failedCalls += 1;
    return Promise.reject(new Error("temporary"));
  };

  await expect(loader.loadModule("temporary-module", failingImporter)).rejects.toThrow("temporary");
  await expect(loader.loadModule("temporary-module", failingImporter)).rejects.toThrow("temporary");
  expect(failedCalls).toBe(2);
});
