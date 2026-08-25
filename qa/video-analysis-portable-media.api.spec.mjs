import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const matchId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function clickEvent(action, id = "") {
  const node = {
    nodeType: 1,
    dataset: { videoAnalysisPortableAction: action, videoAnalysisPortableAsset: id },
    closest: () => node,
  };
  return { target: node };
}

test("portable review contracts reject local media and preserve scoped access levels", () => {
  const contracts = require(path.join(rootDir, "api/_lib/video-analysis-portable-contracts.js"));
  const actor = { id: "publisher-1", clubId: "club-1", teamId: "team-1", role: "analyst" };
  const payload = {
    matchId,
    title: "Pressing distances",
    fileName: "Pressing distances.mp4",
    sizeBytes: 8_400_000,
    sha256: "a".repeat(64),
    manifestSha256: "b".repeat(64),
    manifest: {
      title: "Pressing distances",
      range: { startMs: 21_000, endMs: 36_000 },
      source: { matchId, angleLabel: "Tactical wide", angleRole: "tactical" },
      analysis: { compositeMode: "burn-in", compositePrimitiveCount: 12 },
      preset: "analysis-1080p",
    },
    shareTargets: [
      { targetType: "role", targetId: "coach", accessLevel: "view" },
      { targetType: "team", targetId: "another-team", accessLevel: "download" },
    ],
  };
  const normalized = contracts.normalizePortableReservation(payload, actor);
  expect(normalized).toMatchObject({
    matchId,
    title: "Pressing distances",
    visibility: "targets",
    targets: [{ targetType: "role", targetId: "coach", accessLevel: "view" }],
    manifest: {
      schema: "football-science-portable-review-v1",
      range: { startMs: 21_000, endMs: 36_000 },
      analysis: { compositeMode: "burn-in", compositePrimitiveCount: 12 },
    },
    sourceManifestSha256: "b".repeat(64),
  });
  expect(normalized.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(normalized.manifestSha256).not.toBe(normalized.sourceManifestSha256);
  expect(JSON.stringify(normalized)).not.toContain("localVideoIdentifier");
  expect(() => contracts.normalizePortableReservation({
    ...payload,
    manifest: { ...payload.manifest, localPath: "/Users/coach/match.mp4" },
  }, actor)).toThrow(/video files and local file paths/i);
  expect(() => contracts.normalizePortableReservation(payload, { ...actor, role: "guest" })).toThrow(/authorized football staff/i);

  const row = {
    id: assetId,
    organization_id: "club-1",
    team_id: "team-1",
    owner_id: "publisher-1",
    status: "ready",
    visibility: "targets",
  };
  const viewer = { id: "coach-1", clubId: "club-1", teamId: "team-1", role: "coach" };
  const target = { target_type: "role", target_id: "coach", access_level: "view", status: "active" };
  expect(contracts.portableAccessForActor(row, [target], viewer)).toEqual({ canDownload: false, canView: true });
  expect(contracts.portableAccessForActor(row, [{ ...target, access_level: "download" }], viewer)).toEqual({ canDownload: true, canView: true });
  expect(contracts.portableAccessForActor(row, [], { ...viewer, role: "player" })).toEqual({ canDownload: false, canView: false });
  expect(contracts.portableStoragePath(normalized.scope, assetId)).toMatch(/^[a-f0-9]{24}\/[a-f0-9]{24}\/[a-f0-9-]{36}\.mp4$/);
});

test("portable review migration is private, tenant-scoped and stores no signed URLs", async () => {
  const migration = await fs.readFile(
    path.join(rootDir, "supabase/migrations/20260825005720_video_analysis_portable_media.sql"),
    "utf8",
  );
  const schema = migration.replace(/^--.*$/gm, "");
  for (const table of ["video_portable_media_assets", "video_portable_media_share_targets"]) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
  }
  expect(migration).toContain("organization_id text not null");
  expect(migration).toContain("team_id text not null");
  expect(migration).toContain("source_manifest_sha256 text not null");
  expect(schema).not.toMatch(/signed[_ ]?url|local[_ ]?(?:path|file)|video[_ ]?(?:blob|bytes)/i);
  expect(schema).not.toMatch(/(?:create|alter|drop)\s+(?:table|function|trigger|policy)[\s\S]{0,80}storage\./i);

  const router = await fs.readFile(path.join(rootDir, "api/_lib/video-analysis-database.js"), "utf8");
  for (const action of [
    "portable-media",
    "reserve-portable-media",
    "complete-portable-media",
    "open-portable-media",
    "revoke-portable-media",
  ]) expect(router).toContain(`action === "${action}"`);
  const database = await fs.readFile(path.join(rootDir, "api/_lib/video-analysis-portable-database.js"), "utf8");
  expect(database).toContain("payload.download === true && !access.canDownload");
});

test("portable publishing fails closed on tenant references and owner quota", async () => {
  const database = require(path.join(rootDir, "api/_lib/video-analysis-portable-database.js"));
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://portable-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  const actor = { id: "publisher-1", clubId: "club-1", teamId: "team-1", role: "analyst" };
  const portableMedia = {
    matchId,
    title: "Pressing distances",
    sizeBytes: 8_400_000,
    sha256: "a".repeat(64),
    sourceManifestSha256: "b".repeat(64),
    manifest: { title: "Pressing distances", range: { startMs: 21_000, endMs: 36_000 }, source: { matchId } },
  };
  const requests = [];
  try {
    global.fetch = async (url) => {
      requests.push(String(url));
      return Response.json([]);
    };
    const missing = await database.reservePortableMedia(portableMedia, actor);
    expect(missing).toMatchObject({ ok: false, status: 404 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("organization_id=eq.club-1");
    expect(requests[0]).toContain("team_id=eq.team-1");

    requests.length = 0;
    global.fetch = async (url) => {
      const value = String(url);
      requests.push(value);
      if (value.includes("/video_matches?")) return Response.json([{ id: matchId }]);
      if (value.includes("status=in.%28uploading%2Cready%29")) {
        return Response.json(Array.from({ length: 120 }, () => ({ status: "ready", size_bytes: 1 })));
      }
      throw new Error(`Unexpected portable test request: ${value}`);
    };
    const overQuota = await database.reservePortableMedia(portableMedia, actor);
    expect(overQuota).toMatchObject({ ok: false, status: 429 });
    expect(overQuota.reason).toMatch(/quota/i);
    expect(requests).toHaveLength(2);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("portable media controller publishes without retaining upload credentials and maps review time", async () => {
  const controllerModule = await import(moduleUrl("src/modules/video-analysis/controllers/portableMediaController.js"));
  const media = await import(moduleUrl("src/modules/video-analysis/services/mediaProductionService.js"));
  const token = "signed-upload-token-that-must-never-enter-state-123456789";
  const asset = {
    id: assetId,
    matchId,
    title: "Pressing distances",
    fileName: "Pressing distances.mp4",
    owner: true,
    canDownload: true,
    sourceManifestSha256: "b".repeat(64),
    manifest: { range: { startMs: 21_000, endMs: 36_000 } },
  };
  let state = {
    match: { id: matchId },
    mediaProduction: {
      ...media.createInitialMediaProductionState(),
      export: {
        status: "ready",
        title: "Pressing distances",
        result: {
          artifactId: "33333333-3333-4333-8333-333333333333",
          fileName: "Pressing distances.mp4",
          sizeBytes: 8_400_000,
          sha256: "a".repeat(64),
          manifestSha256: "b".repeat(64),
          exportManifestId: "44444444-4444-4444-8444-444444444444",
          manifest: { title: "Pressing distances", range: { startMs: 21_000, endMs: 36_000 }, source: { matchId } },
        },
      },
    },
    presentation: { current: { shareTargets: [{ targetType: "role", targetId: "coach", accessLevel: "view" }] } },
  };
  const calls = [];
  const repository = {
    portableMedia: async () => ({ assets: [] }),
    reservePortableMedia: async (payload) => {
      calls.push(["reserve", payload]);
      return { asset: { id: assetId }, upload: { assetId, token } };
    },
    completePortableMedia: async () => ({ asset }),
    openPortableMedia: async () => ({
      asset,
      playback: { url: "https://storage.example/private-review", expiresAt: "2026-08-24T19:00:00.000Z" },
    }),
    revokePortableMedia: async () => ({ asset: { ...asset, status: "revoked" } }),
  };
  const video = { play: async () => {}, pause: () => {} };
  const controller = controllerModule.createPortableMediaController({
    getState: () => state,
    updateState: (updater) => { state = updater(state); },
    getVideoElement: () => video,
    getWindow: () => ({ requestAnimationFrame: (callback) => callback() }),
    publishLocal: async (result, upload, options) => {
      expect(result.artifactId).toBeTruthy();
      expect(upload.token).toBe(token);
      options.onQueued?.({ jobId: "job-1", statusUrl: "http://127.0.0.1/jobs/job-1", sessionToken: "local-session" });
      options.onProgress?.({ stage: "uploading portable review", ratio: 0.5 });
      return { uploadedBytes: result.sizeBytes };
    },
    repository,
    seekToMatchMs: (value) => calls.push(["seek", value]),
  });
  expect(controller.handleClick(clickEvent("publish"))).toBe(true);
  await expect.poll(() => state.mediaProduction.portable.status).toBe("ready");
  expect(state.mediaProduction.portable.assets).toEqual([asset]);
  expect(JSON.stringify(state)).not.toContain(token);
  expect(calls[0][1].shareTargets).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({
    exportManifestId: "44444444-4444-4444-8444-444444444444",
    sourceManifestSha256: "b".repeat(64),
  });

  expect(controller.handleClick(clickEvent("open", assetId))).toBe(true);
  await expect.poll(() => state.mediaProduction.portable.playback?.active).toBe(true);
  expect(media.activeMediaReference(state)).toMatchObject({
    objectUrl: "https://storage.example/private-review",
    durationMs: 15_000,
  });
  expect(media.matchTimeFromActiveVideoMs(state, 4000)).toBe(25_000);
  expect(media.activeVideoTimeFromMatchMs(state, 34_000)).toBe(13_000);
  expect(calls).toContainEqual(["seek", 21_000]);
});

test("local companion uploads only a successful checksummed render from the same secure session", async () => {
  const serverModule = await import(moduleUrl("desktop/local-video-app/local-video-server/server.mjs"));
  const configModule = await import(moduleUrl("desktop/local-video-app/local-video-server/config.mjs"));
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-portable-media-test-"));
  const sourceBytes = Buffer.from("device-local-source");
  const renderedBytes = Buffer.from("rendered-portable-review");
  const digest = createHash("sha256").update(renderedBytes).digest("hex");
  let uploaded = null;
  const config = {
    ...configModule.createLocalVideoServerConfig({}, { homeDir: cacheDir }),
    port: 0,
    cacheDir,
    maxInputBytes: 4096,
    maxCacheBytes: 16384,
    maxConcurrentJobs: 1,
    maxQueuedJobs: 2,
    maxExportDurationMs: 60_000,
    portableStorageHosts: ["storage.test.local"],
  };
  const engine = {
    async renderExport(inputPath, outputPath, specification) {
      expect(await fs.readFile(inputPath)).toEqual(sourceBytes);
      await fs.writeFile(outputPath, renderedBytes);
      return { startMs: specification.startMs, endMs: specification.endMs, durationMs: 5000, height: 1080, codec: "h264", container: "mp4" };
    },
    async preparePlaybackCopy() { return { mode: "remux" }; },
  };
  const portableUploader = {
    async upload(filePath, reservation, options) {
      uploaded = { bytes: await fs.readFile(filePath), reservation };
      options.onProgress?.({ stage: "uploading portable review", ratio: 1 });
      return { uploadedBytes: uploaded.bytes.length };
    },
  };
  const localServer = serverModule.createLocalVideoServer({ config, engine, portableUploader });
  try {
    const address = await localServer.listen(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = "https://footballscience.xyz";
    const session = await (await fetch(`${baseUrl}/session`, { method: "POST", headers: { origin } })).json();
    const headers = { origin, "x-football-science-session": session.sessionToken };
    const specification = {
      exportId: "portable-export-1",
      title: "Pressing distances",
      startMs: 1000,
      endMs: 6000,
      preset: "analysis-1080p",
      sourceIdentifier: "local-source-fingerprint",
      manifestSha256: "b".repeat(64),
    };
    const renderResponse = await fetch(`${baseUrl}/jobs/render-export`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "video/mp4",
        "x-football-science-file-name": "match.mp4",
        "x-football-science-export-spec": encoded(specification),
      },
      body: sourceBytes,
    });
    const renderJob = await renderResponse.json();
    expect(renderResponse.status).toBe(202);
    await expect.poll(async () => (await (await fetch(renderJob.statusUrl, { headers })).json()).job?.status).toBe("succeeded");

    const token = "x".repeat(64);
    const publishResponse = await fetch(`${baseUrl}/jobs/publish-export`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        exportArtifactId: renderJob.job.id,
        assetId,
        endpoint: "https://storage.test.local/storage/v1/upload/resumable",
        token,
        bucket: "football-science-video-reviews",
        objectPath: `${"1".repeat(24)}/${"2".repeat(24)}/${assetId}.mp4`,
        expectedBytes: renderedBytes.length,
        sha256: digest,
      }),
    });
    const publishJob = await publishResponse.json();
    expect(publishResponse.status).toBe(202);
    await expect.poll(async () => (await (await fetch(publishJob.statusUrl, { headers })).json()).job?.status).toBe("succeeded");
    const completed = await (await fetch(publishJob.statusUrl, { headers })).json();
    expect(uploaded.bytes).toEqual(renderedBytes);
    expect(uploaded.reservation).toMatchObject({ assetId, expectedBytes: renderedBytes.length, sha256: digest });
    expect(completed.job.result).toMatchObject({ assetId, uploadedBytes: renderedBytes.length, sha256: digest });
    expect(JSON.stringify(completed)).not.toContain(token);
  } finally {
    await localServer.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("TUS client uses bounded chunks, retry and non-persistent fingerprints", async () => {
  const uploadModule = await import(moduleUrl("desktop/local-video-app/local-video-server/portable-upload-client.mjs"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fs-portable-tus-test-"));
  const filePath = path.join(directory, "review.mp4");
  await fs.writeFile(filePath, Buffer.alloc(1024, 7));
  let receivedOptions = null;
  class FakeUpload {
    constructor(stream, options) {
      this.stream = stream;
      receivedOptions = options;
    }
    start() {
      receivedOptions.onProgress(512, 1024);
      receivedOptions.onSuccess();
    }
    async abort() {}
  }
  try {
    const client = uploadModule.createPortableUploadClient({ UploadClass: FakeUpload });
    const progress = [];
    await client.upload(filePath, {
      assetId,
      endpoint: "https://project.storage.supabase.co/storage/v1/upload/resumable",
      token: "x".repeat(64),
      bucket: "football-science-video-reviews",
      objectPath: `${"1".repeat(24)}/${"2".repeat(24)}/${assetId}.mp4`,
      expectedBytes: 1024,
      sha256: "a".repeat(64),
    }, { onProgress: (value) => progress.push(value) });
    expect(receivedOptions.chunkSize).toBe(6 * 1024 * 1024);
    expect(receivedOptions.retryDelays).toEqual([0, 3000, 5000, 10000, 20000]);
    expect(receivedOptions.storeFingerprintForResuming).toBe(false);
    expect(receivedOptions.headers["x-signature"]).toHaveLength(64);
    expect(progress[0]).toMatchObject({ uploadedBytes: 512, totalBytes: 1024, ratio: 0.5 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
