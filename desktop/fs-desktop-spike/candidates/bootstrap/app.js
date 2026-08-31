import { activeNative } from "./tauri-invoke.mjs";

const statusNode = document.getElementById("status");
const detailsNode = document.getElementById("details");

function render(status, message) {
  statusNode.textContent = message;
  detailsNode.textContent = JSON.stringify(status, null, 2);
}

function openActive() {
  window.location.replace("/active/index.html");
}

async function waitForCandidate() {
  const deadline = Date.now() + 9_500;
  while (Date.now() < deadline) {
    const status = await activeNative.bootstrapStatus();
    render(status, status.candidateBuildId
      ? "A signed candidate is running in an isolated native window."
      : "The candidate completed or stopped safely.");
    if (status.activeBuildId) {
      openActive();
      return;
    }
    if (!status.candidateBuildId) break;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  throw new Error("No signed candidate became active within the native deadline.");
}

async function openRecovery(message) {
  statusNode.textContent = "No signed active shell is available. Read-only recovery has been opened.";
  detailsNode.textContent = message;
  await activeNative.openRecovery();
}

async function boot() {
  const status = await activeNative.bootstrapStatus();
  render(status, "The native last-known-good registry has been verified.");
  if (status.activeBuildId) {
    openActive();
    return;
  }
  render(status, "Downloading an immutable manifest and detached signature.");
  try {
    const prepared = await activeNative.prepareShellUpdate();
    render(prepared, "The signed assets were staged. Native compatibility verification is isolated.");
    if (prepared.state === "candidate-staged" || prepared.state === "candidate-pending") {
      await waitForCandidate();
      return;
    }
    const refreshed = await activeNative.bootstrapStatus();
    if (refreshed.activeBuildId) {
      openActive();
      return;
    }
    throw new Error("The signed release source returned no activatable generation.");
  } catch (error) {
    await openRecovery(String(error?.message || error));
  }
}

boot().catch((error) => {
  openRecovery("The trusted bootstrap stopped safely.").catch(() => {});
  detailsNode.textContent = String(error?.message || error);
});
