import { expect, test } from "@playwright/test";
import { createProfileImageDataUrl } from "../src/modules/profile/index.mjs";

class FakeImage {
  constructor() {
    this.naturalHeight = 800;
    this.naturalWidth = 1200;
  }
  set src(value) {
    this.loadedSrc = value;
    queueMicrotask(() => this.onload?.());
  }
}

function createProfileImageTestDeps() {
  const revoked = [];
  return {
    documentRef: {
      createElement: () => ({
        getContext: () => ({
          clearRect() {},
          drawImage() {},
        }),
        toDataURL: (format, quality) => `data:${format};q=${quality};base64,abc`,
      }),
    },
    ImageCtor: FakeImage,
    maxUploadDataUrlLength: 120,
    URLRef: {
      createObjectURL: () => "blob:test",
      revokeObjectURL: (url) => revoked.push(url),
    },
    revoked,
  };
}

test("Profile image helper compresses square profile images outside app.js", async ({}, testInfo) => {
  const appSource = await import("node:fs/promises").then((fs) => fs.readFile("app-runtime.js", "utf8"));
  expect(appSource).not.toContain("const outputSizes = [512, 448, 384, 320, 256, 192, 128]");

  const deps = createProfileImageTestDeps();
  const dataUrl = await createProfileImageDataUrl({ type: "image/png", size: 1024 }, deps);
  expect(dataUrl).toContain("data:image/webp");
  expect(deps.revoked).toEqual(["blob:test"]);
});

test("Profile image helper keeps the existing validation contract", async () => {
  await expect(createProfileImageDataUrl({ type: "text/plain", size: 1 }, createProfileImageTestDeps())).rejects.toThrow("Choose an image file.");
  await expect(createProfileImageDataUrl({ type: "image/png", size: 19 * 1024 * 1024 }, createProfileImageTestDeps())).rejects.toThrow("Choose an image under 18 MB.");
});
