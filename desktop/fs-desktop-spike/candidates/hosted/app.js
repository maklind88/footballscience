import { createDesktopBridge, verifyDeniedNativeCommand } from "./bridge.mjs";
import { SessionAuthority } from "./session-authority.mjs";
import { classifyShellUpdateFailure, ConnectivityState } from "./connectivity-state.mjs";
import { SessionPlannerOfflineController } from "./session-planner-offline.mjs";
import { candidateIsolationProbe, candidateNative } from "./tauri-invoke.mjs";

const localSchemaVersion = 3;
const syncProtocolVersion = 1;
const ui = Object.fromEntries(
  ["shell", "connectivity", "authority", "projection", "sync", "bridge", "session", "details"]
    .map((id) => [id, document.getElementById(id)]),
);

function candidateOrigin() {
  return window.location.protocol === "fs-candidate:"
    || window.location.hostname === "fs-candidate.localhost";
}

async function denied(action) {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}

async function bootCandidate() {
  let status;
  try {
    status = await candidateNative.status();
    const expected = ["candidate.confirm", "candidate.failure", "candidate.status"];
    if (JSON.stringify(status.candidateCapabilities) !== JSON.stringify(expected)
      || status.localSchemaVersion !== localSchemaVersion
      || status.syncProtocolVersion !== syncProtocolVersion) {
      throw new Error("candidate-compatibility-mismatch");
    }
    ui.shell.textContent = `${status.candidateBuildId} (isolated candidate)`;
    ui.connectivity.textContent = "native compatibility only";
    ui.authority.textContent = "denied by candidate ACL";
    ui.projection.textContent = "not loaded";
    ui.sync.textContent = "not available";
    ui.bridge.textContent = "three candidate-only commands";
    ui.details.textContent = JSON.stringify({
      schema: status.schema,
      candidateBuildId: status.candidateBuildId,
      releaseSequence: status.releaseSequence,
      deadlineUnixMs: status.deadlineUnixMs,
      capabilities: status.candidateCapabilities,
    }, null, 2);

    if (status.candidateBuildId.includes("hanging")) {
      ui.details.textContent += "\n\nSynthetic timeout candidate intentionally withheld confirmation.";
      return;
    }

    const negativeChecks = {
      sessionAuthorityDenied: await denied(candidateIsolationProbe.sessionAuthority),
      sessionReadDenied: await denied(candidateIsolationProbe.sessionRead),
      sessionSyncStatusDenied: await denied(candidateIsolationProbe.sessionSyncStatus),
      sessionOperationDenied: await denied(candidateIsolationProbe.sessionOperation),
      outboxDenied: await denied(candidateIsolationProbe.outbox),
      activeConfirmationDenied: await denied(candidateIsolationProbe.obsoleteActiveConfirmation),
    };
    if (!Object.values(negativeChecks).every(Boolean)) {
      throw new Error("candidate-isolation-proof-failed");
    }
    await candidateNative.confirm({
      schema: "fs-desktop-candidate-ready-v2",
      healthNonce: status.healthNonce,
      shellFullyInitialized: true,
      negativeChecks,
    });
  } catch {
    if (status?.healthNonce) {
      await candidateNative.reportFailure({
        healthNonce: status.healthNonce,
        failureCode: "initialization-failed",
      }).catch(() => {});
    }
  }
}

function renderSession(controller) {
  const { slice, presentation, feedback, busy } = controller.snapshot();
  ui.session.hidden = false;
  ui.session.replaceChildren();
  ui.session.dataset.syncState = presentation.state;
  ui.sync.textContent = presentation.label;

  const heading = document.createElement("div");
  heading.className = "session-heading";
  const headingCopy = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "Selected Session Planner session";
  const summary = document.createElement("p");
  summary.textContent = `${slice.session.scheduledDate} · local revision ${slice.session.revision}`;
  headingCopy.append(title, summary);
  const status = document.createElement("div");
  status.className = "sync-status";
  status.dataset.state = presentation.state;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const statusLabel = document.createElement("strong");
  statusLabel.textContent = presentation.label;
  const statusDetail = document.createElement("span");
  statusDetail.textContent = presentation.detail;
  status.append(statusLabel, statusDetail);
  heading.append(headingCopy, status);

  const titleForm = document.createElement("form");
  titleForm.className = "editor-row title-editor";
  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Session name";
  titleLabel.htmlFor = "session-title-input";
  const titleInput = document.createElement("input");
  titleInput.id = "session-title-input";
  titleInput.name = "sessionTitle";
  titleInput.value = slice.session.title;
  titleInput.maxLength = 120;
  titleInput.required = true;
  titleInput.disabled = busy;
  const titleButton = document.createElement("button");
  titleButton.type = "submit";
  titleButton.textContent = "Save name offline";
  titleButton.disabled = busy;
  titleForm.append(titleLabel, titleInput, titleButton);

  const blocks = document.createElement("div");
  blocks.className = "block-list";
  for (const block of slice.blocks) {
    const form = document.createElement("form");
    form.className = "editor-row block-editor";
    const copy = document.createElement("div");
    const blockTitle = document.createElement("strong");
    blockTitle.textContent = `${block.position}. ${block.title}`;
    const blockType = document.createElement("span");
    blockType.textContent = block.blockType;
    copy.append(blockTitle, blockType);
    const durationLabel = document.createElement("label");
    const durationId = `block-duration-${block.id}`;
    durationLabel.textContent = "Minutes";
    durationLabel.htmlFor = durationId;
    const durationInput = document.createElement("input");
    durationInput.id = durationId;
    durationInput.name = "durationMinutes";
    durationInput.type = "number";
    durationInput.min = "1";
    durationInput.max = "240";
    durationInput.step = "1";
    durationInput.value = String(block.durationMinutes);
    durationInput.required = true;
    durationInput.disabled = busy;
    const durationButton = document.createElement("button");
    durationButton.type = "submit";
    durationButton.textContent = "Save duration offline";
    durationButton.disabled = busy;
    form.append(copy, durationLabel, durationInput, durationButton);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pending = controller.setBlockDuration(block.id, Number(durationInput.value));
      renderSession(controller);
      await pending;
      renderSession(controller);
    });
    blocks.append(form);
  }
  titleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pending = controller.renameSession(titleInput.value);
    renderSession(controller);
    await pending;
    renderSession(controller);
  });

  const feedbackLine = document.createElement("p");
  feedbackLine.className = "session-feedback";
  feedbackLine.textContent = feedback || "Edits are committed to SQLite and its durable outbox before this screen confirms them.";
  ui.session.append(heading, titleForm, blocks, feedbackLine);
}

async function bootActive() {
  const bridge = createDesktopBridge();
  const connectivity = new ConnectivityState();
  const authority = new SessionAuthority({ adapter: { readSnapshot: () => bridge.getSessionAuthority() } });
  const bootstrap = await bridge.getBootstrapStatus();
  const frontendBuildId = bootstrap.activeBuildId;
  if (!frontendBuildId) throw new Error("Native active generation is unavailable.");
  const runtime = await bridge.getRuntimeInfo();
  if (runtime.localSchemaVersion !== localSchemaVersion || runtime.syncProtocolVersion !== syncProtocolVersion) {
    throw new Error("Native compatibility mismatch.");
  }
  const authoritySnapshot = await authority.snapshot();
  const context = await authority.contextProof(frontendBuildId);
  connectivity.transition("offline-cold-start", "verified native shell and authority available");
  const slice = await bridge.readSelectedSession(context);
  const syncStatus = await bridge.getSessionSyncStatus(context);
  const sessionController = new SessionPlannerOfflineController({
    bridge,
    context,
    clientInstanceId: crypto.randomUUID(),
    initialSlice: slice,
    initialSyncStatus: syncStatus,
  });
  connectivity.transition("offline-ready", "selected normalized Session Planner projection loaded");
  renderSession(sessionController);
  const unauthorizedCommandRejected = await verifyDeniedNativeCommand();
  ui.shell.textContent = `${frontendBuildId} (active)`;
  ui.connectivity.textContent = connectivity.snapshot().state;
  ui.authority.textContent = `${authoritySnapshot.state} · ${authoritySnapshot.partitionKey}`;
  ui.projection.textContent = `${slice.blocks.length} blocks · ${slice.players.length} player refs · ${slice.exercises.length} exercise refs`;
  ui.bridge.textContent = `${runtime.capabilities.length} typed active capabilities; no generic filesystem/SQL/HTTP/shell API`;
  ui.details.textContent = JSON.stringify({
    runtime,
    projectionSchema: slice.projectionSchema,
    excludedFields: slice.excludedFields,
    syntheticIdentity: authoritySnapshot.syntheticIdentity,
    unauthorizedCommandRejected,
  }, null, 2);

  let checking = false;
  async function checkUpdate() {
    if (checking) return;
    checking = true;
    let bootMode = "online";
    try {
      connectivity.transition("online-checking", "native signed release source check started");
      await bridge.prepareShellUpdate();
      const refreshed = await bridge.getBootstrapStatus();
      if (refreshed.activeBuildId && refreshed.activeBuildId !== frontendBuildId) {
        window.location.reload();
        return;
      }
      connectivity.transition("online-ready", "signed release source checked");
    } catch (error) {
      const message = String(error?.message || error);
      bootMode = classifyShellUpdateFailure(message);
      connectivity.transition(
        bootMode === "offline" ? "offline-ready" : "compatibility-blocked",
        "active known-good generation retained",
      );
      ui.details.textContent += `\n\nUpdate source: ${message}`;
    } finally {
      checking = false;
    }
    ui.connectivity.textContent = connectivity.snapshot().state;
    await bridge.recordProbe({
      candidate: "hosted",
      bootMode,
      shellVersion: frontendBuildId,
      cacheVersion: "fs-desktop-native-shell-cache-v2",
      payloadBuildId: frontendBuildId,
      cachedPayload: true,
      serviceWorkerControlled: false,
      unauthorizedCommandRejected,
    });
  }
  await checkUpdate();
  window.setInterval(() => checkUpdate().catch(() => {}), 1_500);
}

(candidateOrigin() ? bootCandidate() : bootActive()).catch((error) => {
  ui.details.textContent = String(error?.message || error);
});
