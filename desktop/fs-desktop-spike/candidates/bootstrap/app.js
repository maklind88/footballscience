const invoke = window.__TAURI__?.core?.invoke;
const statusNode = document.getElementById("status");
const detailsNode = document.getElementById("details");

if (typeof invoke !== "function") throw new Error("Native bootstrap bridge unavailable.");

function openChannel(channel, nonce = "") {
  const query = nonce ? `?healthNonce=${encodeURIComponent(nonce)}` : "";
  window.location.replace(`/${channel}/index.html${query}`);
}

async function boot() {
  const status = await invoke("desktop_bootstrap_status");
  detailsNode.textContent = JSON.stringify(status, null, 2);
  if (status.candidateBuildId && status.candidateHealthNonce) {
    statusNode.textContent = "Retrying a fully verified candidate after an interrupted initialization.";
    openChannel("candidate", status.candidateHealthNonce);
    return;
  }
  if (status.activeBuildId) {
    statusNode.textContent = "Checking briefly for a verified replacement before opening the active known-good shell.";
    try {
      const prepared = await Promise.race([
        invoke("desktop_prepare_shell_update"),
        new Promise((resolve) => window.setTimeout(() => resolve({ state: "bootstrap-timeout" }), 1500)),
      ]);
      if (prepared.state === "candidate-staged" && prepared.healthNonce) {
        openChannel("candidate", prepared.healthNonce);
        return;
      }
    } catch (error) {
      await fetch(`/bootstrap/diagnostic?stage=active-update-check-failed&message=${encodeURIComponent(String(error?.message || error).slice(0, 300))}`, { cache: "no-store" }).catch(() => {});
    }
    openChannel("active");
    return;
  }
  statusNode.textContent = "Downloading and verifying the first shell generation.";
  try {
    const prepared = await invoke("desktop_prepare_shell_update");
    detailsNode.textContent = JSON.stringify(prepared, null, 2);
    if (prepared.state === "candidate-staged" && prepared.healthNonce) {
      openChannel("candidate", prepared.healthNonce);
      return;
    }
    throw new Error("No usable active or candidate generation was returned.");
  } catch (error) {
    statusNode.textContent = "The update source is unavailable. Opening the bundled recovery shell.";
    detailsNode.textContent = String(error?.message || error);
    await fetch(`/bootstrap/diagnostic?stage=update-failed&message=${encodeURIComponent(String(error?.message || error).slice(0, 300))}`, { cache: "no-store" }).catch(() => {});
    window.setTimeout(() => openChannel("fallback"), 250);
  }
}

boot().catch((error) => {
  statusNode.textContent = "Bootstrap stopped safely.";
  detailsNode.textContent = String(error?.stack || error?.message || error);
  fetch(`/bootstrap/diagnostic?stage=failed&message=${encodeURIComponent(String(error?.message || error).slice(0, 300))}`, { cache: "no-store" }).catch(() => {});
});
