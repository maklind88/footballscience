import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(rootDir, relativePath)).href;
}

function dataEvent(blob) {
  const event = new Event("dataavailable");
  Object.defineProperty(event, "data", { value: blob });
  return event;
}

function captureWindow() {
  const captures = [];
  const tracks = [];
  class FakeTrack extends EventTarget {
    stop() { this.stopped = true; }
  }
  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported(value) { return value.startsWith("video/webm"); }
    constructor(stream, options = {}) {
      super();
      this.stream = stream;
      this.mimeType = options.mimeType || "video/webm";
      this.state = "inactive";
      captures.push(this);
    }
    start() { this.state = "recording"; }
    requestData() { this.dispatchEvent(dataEvent(new Blob(["chunk"], { type: "video/webm" }))); }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      queueMicrotask(() => this.dispatchEvent(new Event("stop")));
    }
  }
  const handles = [];
  const win = {
    MediaRecorder: FakeMediaRecorder,
    navigator: {
      mediaDevices: {
        async getDisplayMedia() {
          const track = new FakeTrack();
          tracks.push(track);
          return { getTracks: () => [track], getVideoTracks: () => [track] };
        },
        async getUserMedia() {
          const track = new FakeTrack();
          tracks.push(track);
          return { getTracks: () => [track], getVideoTracks: () => [track] };
        },
      },
    },
    async showSaveFilePicker() {
      const chunks = [];
      const handle = {
        aborted: false,
        closed: false,
        writes: 0,
        async createWritable() {
          return {
            write: async (blob) => { chunks.push(blob); handle.writes += 1; },
            close: async () => { handle.closed = true; },
            abort: async () => { handle.aborted = true; },
          };
        },
        async getFile() {
          return { name: "capture.webm", type: "video/webm", size: chunks.reduce((sum, chunk) => sum + chunk.size, 0) };
        },
      };
      handles.push(handle);
      return handle;
    },
  };
  return { captures, handles, tracks, win };
}

test("live capture writes progressive chunks and finalizes a device-local file", async () => {
  const captureModule = await import(moduleUrl("src/modules/video-analysis/services/localMediaCaptureService.js"));
  const fixture = captureWindow();
  const service = captureModule.createLocalMediaCaptureService({ win: fixture.win });
  expect(service.capabilities()).toMatchObject({ supported: true, progressiveFileWrite: true });
  await service.prepare({ mode: "screen", title: "Match capture" });
  expect(fixture.handles).toHaveLength(1);
  expect(fixture.captures).toHaveLength(0);
  expect(fixture.tracks).toHaveLength(0);
  const session = await service.start({ mode: "screen", title: "Match capture" });
  expect(fixture.captures[0].state).toBe("recording");
  const result = await service.stop();
  expect(result).toMatchObject({ fileName: "capture.webm", mimeType: "video/webm", bytesWritten: 5 });
  expect(fixture.handles[0]).toMatchObject({ writes: 1, closed: true, aborted: false });
  expect(fixture.tracks[0].stopped).toBe(true);

  await service.prepare({ mode: "camera", title: "Bench camera" });
  const externallyStopped = await service.start();
  fixture.captures[1].requestData();
  fixture.captures[1].stop();
  await expect(externallyStopped.completion).resolves.toMatchObject({ fileName: "capture.webm", bytesWritten: 5 });
});

test("cancelled live capture aborts the file instead of publishing a partial angle", async () => {
  const captureModule = await import(moduleUrl("src/modules/video-analysis/services/localMediaCaptureService.js"));
  const fixture = captureWindow();
  const service = captureModule.createLocalMediaCaptureService({ win: fixture.win });
  await service.prepare({ mode: "screen" });
  const session = await service.start();
  const completion = session.completion.catch((error) => error);
  expect(await service.cancel()).toBe(true);
  expect((await completion).name).toBe("AbortError");
  expect(fixture.handles[0]).toMatchObject({ closed: false, aborted: true });
});

test("cancelling a pending permission request cannot start a late recording", async () => {
  const captureModule = await import(moduleUrl("src/modules/video-analysis/services/localMediaCaptureService.js"));
  const fixture = captureWindow();
  let releaseStream;
  const track = new EventTarget();
  track.stop = () => { track.stopped = true; };
  fixture.win.navigator.mediaDevices.getDisplayMedia = () => new Promise((resolve) => { releaseStream = resolve; });
  const service = captureModule.createLocalMediaCaptureService({ win: fixture.win });
  await service.prepare({ mode: "screen" });
  const pendingStart = service.start();
  await Promise.resolve();
  expect(await service.cancel()).toBe(true);
  releaseStream({ getTracks: () => [track], getVideoTracks: () => [track] });
  await expect(pendingStart).rejects.toMatchObject({ name: "AbortError" });
  expect(track.stopped).toBe(true);
  expect(fixture.captures).toHaveLength(0);
  expect(fixture.handles[0].aborted).toBe(true);
});

test("live capture fails closed without progressive local file access", async () => {
  const captureModule = await import(moduleUrl("src/modules/video-analysis/services/localMediaCaptureService.js"));
  const fixture = captureWindow();
  delete fixture.win.showSaveFilePicker;
  const service = captureModule.createLocalMediaCaptureService({ win: fixture.win });
  expect(service.capabilities().supported).toBe(false);
  await expect(service.prepare({ mode: "screen" })).rejects.toThrow(/Chrome or Edge/i);
  expect(fixture.captures).toHaveLength(0);
});
