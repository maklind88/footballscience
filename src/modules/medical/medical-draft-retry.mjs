// New durable copies only. All old recovery rows remain review/export-only.
export function mountMedicalDraftRetry({ win, container, copy, store, isCurrent, getGeneration, acquire, release, onConfirmed = () => {} }) {
  if (copy.retryProtocol !== "medical-recovery-retry-v1" || !Number.isSafeInteger(copy.baseRevision) ||
      copy.baseRevision < 1 || typeof copy.previousValue !== "string") return;
  const button = win.document.createElement("button");
  button.type = "button"; button.textContent = "Retry central saving";
  const status = win.document.createElement("p"); status.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    if (!isCurrent() || !acquire()) return;
    const generation = getGeneration(), current = () => isCurrent() && generation === getGeneration();
    button.disabled = true; status.textContent = "Verifying the saved copy and current central version…";
    try {
      const retained = await store.read(copy.scope, copy.id);
      if (!current()) return;
      if (!retained || JSON.stringify(retained) !== JSON.stringify(copy)) {
        status.textContent = "The retained copy could not be verified. Refresh Recovery and retry."; return;
      }
      const result = await win.footballScienceCentralState?.retryMedicalRecoveryCopy?.(retained, current);
      if (!current()) return;
      status.textContent = result?.ok
        ? "This copy is confirmed saved centrally. The local copy is kept."
        : result?.reason || "Central saving could not be confirmed. The local copy is retained.";
      if (result?.ok) onConfirmed(status.textContent);
    } catch {
      if (current()) status.textContent = "The local copy could not be read. Keep it and retry when storage is available.";
    } finally { release(); button.disabled = false; }
  });
  container.append(button, status);
}
