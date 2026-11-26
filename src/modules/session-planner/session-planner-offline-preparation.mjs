const views = new WeakMap();

export function bindSessionsOfflinePreparation(root, win, date) {
  const button = root.querySelector("[data-session-prepare-offline]");
  const status = root.querySelector("[data-session-offline-status]");
  const auth = win.platformAuthStore;
  if (!button || !status) return;
  const owner = auth?.getSessionsOfflineOwner?.();
  if (!owner || !win.isSecureContext || !win.navigator?.serviceWorker) {
    button.parentElement.hidden = true;
    return;
  }
  const existing = views.get(root);
  const view = existing?.owner === owner && existing.date === date ? existing : { owner, date, outcome: "", text: "" };
  views.set(root, view);
  view.paint = () => {
    const active = auth.getSessionsOfflineOwner() === owner;
    button.disabled = !active || view.outcome === "working";
    status.dataset.sessionOfflineStatus = active ? view.outcome : "";
    status.textContent = active ? view.text : "";
  };
  view.paint();
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    view.outcome = "working";
    view.text = "Preparing offline access…";
    view.paint();
    const isCurrent = () => views.get(root) === view && auth.getSessionsOfflineOwner() === owner;
    try {
      const ready = await auth.prepareSessionsOffline(date, isCurrent);
      if (!isCurrent()) return;
      view.outcome = "ready";
      view.text = "Available offline for " + ready.date + " until " +
        new Date(ready.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ".";
    } catch (error) {
      if (!isCurrent()) return;
      view.outcome = "unavailable";
      view.text = error?.message || "Offline preparation could not finish.";
    }
    view.paint();
  });
}
