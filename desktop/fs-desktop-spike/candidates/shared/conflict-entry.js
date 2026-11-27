(() => {
  if (!(location.protocol === "fs-active:" || location.hostname === "fs-active.localhost")) return;
  const start = async () => {
    const { createDesktopBridge } = await import("./desktop-bridge-contract.mjs");
    const bridge = createDesktopBridge();
    if (!(await bridge.getRuntimeInfo()).capabilities.includes("session.conflict-review")) return;
    const style = document.createElement("link");
    style.rel = "stylesheet"; style.href = "/desktop/conflict-panel.css";
    document.head.append(style);
    const { mountConflictPanel } = await import("./conflict-panel.mjs");
    mountConflictPanel(bridge);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start().catch(() => {}), { once: true });
  else start().catch(() => {});
})();
