const attemptedCommand = "desktop_runtime_info";
const invoke = window.__TAURI_INTERNALS__?.invoke;
let allowedCommandRejected = typeof invoke !== "function";
let rejection = "native bridge unavailable";

if (typeof invoke === "function") {
  try {
    await invoke(attemptedCommand);
    rejection = "command unexpectedly succeeded";
  } catch (error) {
    allowedCommandRejected = true;
    rejection = String(error?.message || error || "rejected").slice(0, 180);
  }
}

const evidence = {
  schema: "fs-desktop-unauthorized-origin-probe-v1",
  origin: window.location.origin,
  attemptedCommand,
  allowedCommandRejected,
  rejection,
};

document.getElementById("status").textContent = allowedCommandRejected
  ? "Native command rejected for unauthorized origin."
  : "ERROR: unauthorized origin reached the native command.";

await fetch("/negative-probe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(evidence),
});
