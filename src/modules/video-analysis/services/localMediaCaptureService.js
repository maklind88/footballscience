function safeFileName(value = "live-capture") {
  return String(value || "live-capture")
    .replace(/[^a-zA-Z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "live-capture";
}

function recorderMimeType(win = window) {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((value) => win.MediaRecorder?.isTypeSupported?.(value)) || "";
}

export function localCaptureCapabilities(win = window) {
  const screen = Boolean(win.navigator?.mediaDevices?.getDisplayMedia);
  const camera = Boolean(win.navigator?.mediaDevices?.getUserMedia);
  return {
    supported: Boolean(win.MediaRecorder && win.showSaveFilePicker && (screen || camera)),
    screen,
    camera,
    progressiveFileWrite: Boolean(win.showSaveFilePicker),
  };
}

async function captureStream(mode, win) {
  if (mode === "camera") {
    try {
      return await win.navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (error) {
      if (!["NotFoundError", "OverconstrainedError"].includes(error?.name)) throw error;
      return win.navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }
  return win.navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 60 } },
    audio: true,
  });
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop?.());
}

export function createLocalMediaCaptureService(options = {}) {
  const win = options.win || window;
  let active = null;
  let generation = 0;

  async function prepare(startOptions = {}) {
    if (active) throw new Error("A local capture is already running.");
    const token = ++generation;
    const capabilities = localCaptureCapabilities(win);
    const mode = startOptions.mode === "camera" ? "camera" : "screen";
    if (!capabilities.supported || !capabilities[mode]) {
      throw new Error("Live capture requires Chrome or Edge with secure local file writing.");
    }
    const suggestedName = `${safeFileName(startOptions.title || `football-science-${mode}`)}.webm`;
    const fileHandle = await win.showSaveFilePicker({
      suggestedName,
      types: [{ description: "WebM video", accept: { "video/webm": [".webm"] } }],
    });
    const writable = await fileHandle.createWritable();
    if (token !== generation) {
      await writable.abort?.().catch?.(() => {});
      const error = new Error("Live capture was cancelled.");
      error.name = "AbortError";
      throw error;
    }
    active = { cancelled: false, fileHandle, mode, status: "prepared", suggestedName, writable };
    return { fileName: suggestedName, mode };
  }

  async function start(startOptions = {}) {
    if (!active || active.status !== "prepared") {
      throw new Error("Choose a local capture file before starting the recording.");
    }
    const prepared = active;
    const { fileHandle, mode, suggestedName, writable } = prepared;
    let stream;
    try {
      stream = await captureStream(mode, win);
    } catch (error) {
      await writable.abort?.().catch?.(() => {});
      if (active === prepared) active = null;
      throw error;
    }
    if (prepared.cancelled || active !== prepared) {
      stopTracks(stream);
      await writable.abort?.().catch?.(() => {});
      const error = new Error("Live capture was cancelled.");
      error.name = "AbortError";
      throw error;
    }
    const mimeType = recorderMimeType(win);
    const recorder = new win.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const startedAtEpochMs = Date.now();
    let bytesWritten = 0;
    let writeError = null;
    let writeChain = Promise.resolve();
    let resolveCompletion;
    let rejectCompletion;
    const completion = new Promise((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const session = { ...prepared, completion, recorder, status: "recording", stream };
    active = session;

    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data?.size) return;
      writeChain = writeChain.then(async () => {
        await writable.write(event.data);
        bytesWritten += event.data.size;
        startOptions.onProgress?.({ bytesWritten, elapsedMs: Date.now() - startedAtEpochMs });
      }).catch((error) => {
        writeError = error;
        if (recorder.state !== "inactive") recorder.stop();
      });
    });
    recorder.addEventListener("error", (event) => {
      writeError = event.error || new Error("The browser could not continue recording.");
      if (recorder.state !== "inactive") recorder.stop();
    });
    recorder.addEventListener("stop", async () => {
      stopTracks(stream);
      try {
        await writeChain;
        if (session.cancelled) {
          await writable.abort?.();
          const error = new Error("Live capture was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        if (writeError) throw writeError;
        await writable.close();
        const file = await fileHandle.getFile();
        resolveCompletion({
          file,
          fileName: file.name || suggestedName,
          mimeType: file.type || mimeType || "video/webm",
          bytesWritten: file.size || bytesWritten,
          durationMs: Math.max(1, Date.now() - startedAtEpochMs),
        });
      } catch (error) {
        await writable.abort?.().catch?.(() => {});
        rejectCompletion(error);
      } finally {
        if (active === session) active = null;
      }
    }, { once: true });
    stream.getVideoTracks?.().forEach((track) => {
      track.addEventListener?.("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      }, { once: true });
    });
    recorder.start(1000);
    return { completion, fileName: suggestedName, mimeType: recorder.mimeType || mimeType, mode, startedAtEpochMs };
  }

  async function stop() {
    if (!active?.recorder) return null;
    if (active.recorder.state !== "inactive") {
      active.recorder.requestData?.();
      active.recorder.stop();
    }
    return active.completion;
  }

  async function cancel() {
    generation += 1;
    if (!active) return false;
    const session = active;
    active = null;
    session.cancelled = true;
    const completion = session.completion?.catch(() => null);
    stopTracks(session.stream);
    if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
    await session.writable.abort?.().catch?.(() => {});
    if (completion) await completion;
    return true;
  }

  return { cancel, capabilities: () => localCaptureCapabilities(win), prepare, start, stop };
}
