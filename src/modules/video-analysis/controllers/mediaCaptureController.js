import { eventElement } from "../video-analysis.dom-events.js";

function patchCapture(state = {}, patch = {}) {
  return {
    ...state,
    mediaProduction: {
      ...(state.mediaProduction || {}),
      capture: { ...(state.mediaProduction?.capture || {}), ...patch },
    },
  };
}

function captureLabel(mode = "screen", date = new Date()) {
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).replace(/:/g, "-");
  return `Live ${mode === "camera" ? "camera" : "screen"} ${time}`;
}

export function createMediaCaptureController(options = {}) {
  const getState = options.getState || (() => ({}));
  const updateState = options.updateState || (() => {});
  const win = options.getWindow?.() || globalThis.window;
  let captureToken = 0;
  let ticker = 0;

  function clearTicker() {
    if (ticker) win?.clearInterval?.(ticker);
    ticker = 0;
  }

  function initialize() {
    const capabilities = options.captureService.capabilities();
    updateState((state) => patchCapture(state, { capabilities }));
    return capabilities;
  }

  function fail(error, token) {
    if (token !== captureToken) return;
    clearTicker();
    if (error?.name === "AbortError") {
      updateState((state) => patchCapture(state, { status: "cancelled", error: "" }));
      return;
    }
    updateState((state) => patchCapture(state, {
      status: "error",
      error: error?.name === "NotAllowedError"
        ? "Capture permission was not granted."
        : error?.message || "Live capture could not be completed.",
    }));
  }

  async function complete(result, token, mode, startedAtMatchMs) {
    if (token !== captureToken) return false;
    clearTicker();
    updateState((state) => patchCapture(state, {
      status: "finalizing",
      bytesWritten: result.bytesWritten,
      elapsedMs: result.durationMs,
      error: "",
    }));
    try {
      const connected = await options.connectCapturedFile(result.file, "", {
        label: captureLabel(mode),
        role: mode === "camera" ? "bench" : "broadcast",
        syncOffsetMs: -startedAtMatchMs,
        metadata: {
          captureMode: mode,
          capturedLocally: true,
          captureStartedAtMatchMs: startedAtMatchMs,
        },
      });
      if (!connected) throw new Error("The completed recording could not be linked as a camera angle.");
      if (token !== captureToken) return false;
      updateState((state) => patchCapture(state, {
        status: "ready",
        fileName: result.fileName,
        bytesWritten: result.bytesWritten,
        elapsedMs: result.durationMs,
        error: "",
      }));
      return true;
    } catch (error) {
      fail(error, token);
      return false;
    }
  }

  async function prepare(mode = "screen") {
    const current = getState().mediaProduction?.capture || {};
    if (["requesting-file", "armed", "requesting", "recording", "stopping", "finalizing"].includes(current.status)) return false;
    const token = ++captureToken;
    clearTicker();
    updateState((state) => patchCapture(state, {
      status: "requesting-file",
      mode,
      elapsedMs: 0,
      bytesWritten: 0,
      fileName: "",
      error: "",
    }));
    try {
      const prepared = await options.captureService.prepare({
        mode,
        title: captureLabel(mode),
      });
      if (token !== captureToken) return false;
      updateState((state) => patchCapture(state, {
        status: "armed",
        mode,
        fileName: prepared.fileName,
      }));
      return true;
    } catch (error) {
      fail(error, token);
      return false;
    }
  }

  async function start() {
    const current = getState().mediaProduction?.capture || {};
    if (current.status !== "armed") return false;
    const token = captureToken;
    const mode = current.mode === "camera" ? "camera" : "screen";
    updateState((state) => patchCapture(state, { status: "requesting", error: "" }));
    try {
      const session = await options.captureService.start({
        onProgress: (progress) => {
          if (token !== captureToken) return;
          updateState((state) => patchCapture(state, progress));
        },
      });
      if (token !== captureToken) return false;
      const startedAtMatchMs = Math.max(0, Math.round(Number(options.getCurrentMatchMs?.()) || 0));
      const startedAtEpochMs = Number(session.startedAtEpochMs) || Date.now();
      updateState((state) => patchCapture(state, {
        status: "recording",
        mode,
        startedAtMatchMs,
        startedAtEpochMs,
        fileName: session.fileName,
      }));
      ticker = win?.setInterval?.(() => {
        if (token !== captureToken) return clearTicker();
        updateState((state) => patchCapture(state, { elapsedMs: Date.now() - startedAtEpochMs }));
      }, 1000) || 0;
      void session.completion
        .then((result) => complete(result, token, mode, startedAtMatchMs))
        .catch((error) => fail(error, token));
      return true;
    } catch (error) {
      fail(error, token);
      return false;
    }
  }

  async function stop() {
    if (getState().mediaProduction?.capture?.status !== "recording") return false;
    updateState((state) => patchCapture(state, { status: "stopping" }));
    await options.captureService.stop();
    return true;
  }

  async function cancel() {
    captureToken += 1;
    clearTicker();
    await options.captureService.cancel();
    updateState((state) => patchCapture(state, { status: "cancelled", error: "" }));
    return true;
  }

  function handleClick(event) {
    const action = eventElement(event)?.closest?.("[data-video-analysis-capture-action]")?.dataset?.videoAnalysisCaptureAction;
    if (action === "prepare-screen" || action === "prepare-camera") {
      void prepare(action === "prepare-camera" ? "camera" : "screen");
      return true;
    }
    if (action === "start") { void start(); return true; }
    if (action === "stop") { void stop(); return true; }
    if (action === "cancel") { void cancel(); return true; }
    return false;
  }

  function dispose() {
    return cancel();
  }

  return { dispose, handleClick, initialize, prepare, start, stop };
}
