import { recoveryNative } from "/tauri-invoke.mjs";

const status = await recoveryNative.status();
const sessionNode = document.getElementById("session");
document.getElementById("status").textContent = status.offlineAccessAvailable
  ? "Read-only local recovery is available."
  : "The local recovery partition is locked.";
document.getElementById("details").textContent = JSON.stringify(status, null, 2);

if (status.offlineAccessAvailable) {
  const slice = await recoveryNative.readSelectedSession();
  sessionNode.hidden = false;
  const heading = document.createElement("h2");
  heading.textContent = slice.session.title;
  const summary = document.createElement("p");
  summary.textContent = `${slice.session.scheduledDate} · revision ${slice.session.revision}`;
  sessionNode.append(heading, summary);
}
