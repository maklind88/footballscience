import { expect, test } from "@playwright/test";
import { createProfileImageDataUrl, createTeamLogoDataUrl } from "../src/modules/profile/index.mjs";

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

function createTeamLogoTestDeps() {
  const drawCalls = [];
  const formats = [];
  const revoked = [];
  return {
    documentRef: {
      createElement: () => ({
        getContext: () => ({
          clearRect() {},
          drawImage(...args) {
            drawCalls.push(args);
          },
        }),
        toDataURL: (format, quality) => {
          formats.push(format);
          return `data:${format};q=${quality ?? "lossless"};base64,abc`;
        },
      }),
    },
    ImageCtor: FakeImage,
    maxUploadDataUrlLength: 160,
    URLRef: {
      createObjectURL: () => "blob:logo",
      revokeObjectURL: (url) => revoked.push(url),
    },
    drawCalls,
    formats,
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

test("Team logo helper preserves safe SVG logos as vector data", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>';
  const dataUrl = await createTeamLogoDataUrl(
    {
      name: "crest.svg",
      size: svg.length,
      text: async () => svg,
      type: "image/svg+xml",
    },
    { maxUploadDataUrlLength: 1200 }
  );

  expect(dataUrl).toContain("data:image/svg+xml");
  expect(decodeURIComponent(dataUrl.split(",")[1])).toContain("<svg");
});

test("Team logo helper rejects unsafe SVG logos", async () => {
  await expect(
    createTeamLogoDataUrl(
      {
        name: "crest.svg",
        size: 80,
        text: async () => '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        type: "image/svg+xml",
      },
      { maxUploadDataUrlLength: 1200 }
    )
  ).rejects.toThrow("Choose a simpler SVG logo");
});

test("Team logo helper rasterizes images without cropping or JPEG fallback", async () => {
  const deps = createTeamLogoTestDeps();
  const dataUrl = await createTeamLogoDataUrl({ name: "crest.png", type: "image/png", size: 1024 }, deps);

  expect(dataUrl).toContain("data:image/webp");
  expect(deps.formats).toContain("image/webp");
  expect(deps.formats).not.toContain("image/jpeg");
  expect(deps.revoked).toEqual(["blob:logo"]);
  const firstDraw = deps.drawCalls[0];
  expect(firstDraw.slice(1, 5)).toEqual([0, 0, 1200, 800]);
  expect(firstDraw[5]).toBeGreaterThan(0);
  expect(firstDraw[6]).toBeGreaterThan(0);
});
