export function createSimulatorAnimationLoop(options = {}) {
  const shouldRun = typeof options.shouldRun === "function" ? options.shouldRun : () => false;
  const onFrame = typeof options.onFrame === "function" ? options.onFrame : () => {};
  let frameId = null;

  function tick(timestamp) {
    frameId = null;

    if (!shouldRun()) {
      return;
    }

    onFrame(timestamp);

    if (shouldRun()) {
      frameId = window.requestAnimationFrame(tick);
    }
  }

  return Object.freeze({
    start() {
      if (frameId !== null || !shouldRun()) {
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    },
    stop() {
      if (frameId === null) {
        return;
      }

      window.cancelAnimationFrame(frameId);
      frameId = null;
    },
    isRunning() {
      return frameId !== null;
    },
  });
}
