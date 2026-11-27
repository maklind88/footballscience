(() => {
  const activeOrigin = location.protocol === "fs-active:"
    || location.hostname === "fs-active.localhost";
  if (!activeOrigin) return;
  const invoke = globalThis.__TAURI_INTERNALS__?.invoke;
  Object.defineProperty(globalThis, "__FOOTBALL_SCIENCE_DESKTOP__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      schema: "fs-desktop-platform-environment-v1",
      nativeBridgeAvailable: typeof invoke === "function",
      signedFrontend: true,
      serviceWorkerRequired: false,
    }),
  });
  if (typeof invoke !== "function") return;

  const classifyUpdateFailure = (error) => {
    const message = String(error?.message || error).toLowerCase();
    if (/(shell source unavailable|shell source returned|connection refused|error sending request|tcp connect|timed? out)/.test(message)) {
      return "offline";
    }
    return /(signature|signing|manifest|asset integrity|bundle|declared boundary|compatib|rollback|release sequence|trusted)/.test(message)
      ? "compatibility-blocked"
      : "offline";
  };

  (async () => {
    const scheduleTimer = globalThis.setTimeout.bind(globalThis);
    const waitForPlatformRuntime = async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (globalThis.__footballScienceAppReady === true) return true;
        if (document.body?.dataset?.appLoadError) return false;
        await new Promise((resolve) => scheduleTimer(resolve, 50));
      }
      return false;
    };
    const initial = await invoke("desktop_bootstrap_status");
    const frontendBuildId = String(initial?.activeBuildId || "");
    if (!frontendBuildId) return;
    let unauthorizedCommandRejected = false;
    try {
      await invoke("internal_denied_probe");
    } catch {
      unauthorizedCommandRejected = true;
    }
    if (!unauthorizedCommandRejected) return;
    const fullPlatformRuntimeLoaded = await waitForPlatformRuntime();
    if (!fullPlatformRuntimeLoaded) return;

    let checking = false;
    const checkUpdate = async () => {
      if (checking) return;
      checking = true;
      let bootMode = "online";
      try {
        await invoke("desktop_prepare_shell_update");
        const refreshed = await invoke("desktop_bootstrap_status");
        if (refreshed?.activeBuildId && refreshed.activeBuildId !== frontendBuildId) {
          location.reload();
          return;
        }
      } catch (error) {
        bootMode = classifyUpdateFailure(error);
      } finally {
        checking = false;
      }
      try {
        await invoke("record_spike_probe", {
          probe: {
            candidate: "hosted",
            bootMode,
            shellVersion: frontendBuildId,
            cacheVersion: "fs-desktop-native-shell-cache-v2",
            payloadBuildId: frontendBuildId,
            cachedPayload: true,
            serviceWorkerControlled: false,
            unauthorizedCommandRejected,
            fullPlatformRuntimeLoaded,
          },
        });
      } finally {
        scheduleTimer(() => checkUpdate().catch(() => {}), 1_500);
      }
    };
    await checkUpdate();
  })().catch(() => {});
})();
