import { medicalRecoveryMatchesCentral } from "./medical-recovery-central-read.mjs";

// User-initiated exact-copy verification and retirement only. Never submit a draft.
export function mountMedicalDraftVerification({ win, container, copy, store, isCurrent, getGeneration, onRemoved }) {
  const node = (tag, text) => { const element = win.document.createElement(tag); element.textContent = text; return element; };
  const check = node("button", "Check against central copy"); check.type = "button";
  const status = node("p", ""); status.setAttribute("role", "status");
  const remove = node("button", "Remove this verified local copy"); remove.type = "button"; remove.hidden = true;
  const explanation = node("p", "This removes this recovery copy and its previous-state backup from this browser. Central work and other copies are kept.");
  explanation.hidden = true;
  const fresh = () => win.footballScienceCentralState?.readMedicalRecoveryState?.(copy.scope);
  let busy = false;
  async function verify(retire) {
    if (busy || !isCurrent()) return;
    const generation = getGeneration();
    const stillCurrent = () => isCurrent() && generation === getGeneration();
    busy = true; check.disabled = true; remove.disabled = true;
    remove.hidden = true; explanation.hidden = true;
    status.textContent = "Checking the current central copy…";
    try {
      const proof = await fresh();
      if (!stillCurrent()) {
        if (isCurrent()) status.textContent = "Medical changed during verification. The copy is kept; check again.";
        return;
      }
      if (!proof?.ok) { status.textContent = "Central verification is unavailable. The local copy is kept; reconnect or sign in and retry."; return; }
      if (!medicalRecoveryMatchesCentral(copy, proof)) {
        status.textContent = "The central copy differs or its version cannot be verified. The local copy is kept for review."; return;
      }
      if (!retire) {
        status.textContent = `This complete copy matches central version ${proof.revision}. Removal checks again before proceeding.`;
        remove.hidden = false; explanation.hidden = false;
        return;
      }
      // The selected immutable generation, fresh receipt and current access are
      // checked again inside the transaction that removes both local rows.
      const removed = await store.removeVerified(copy, proof, stillCurrent);
      if (!stillCurrent()) {
        if (isCurrent()) status.textContent = "Medical changed while removal was completing. Refresh the recovery list to check the result.";
        return;
      }
      if (removed) onRemoved();
      else status.textContent = "Removal could not be confirmed. Refresh the recovery list before trying again.";
    } catch {
      if (isCurrent()) status.textContent = "Verification or removal failed. The local copy was not confirmed removed; retry after refreshing the list.";
    } finally { busy = false; check.disabled = false; remove.disabled = false; }
  }
  check.addEventListener("click", () => { void verify(false); });
  remove.addEventListener("click", () => { void verify(true); });
  const previous = node("details", ""); previous.append(node("summary", "Previous retained content"));
  previous.hidden = copy.previousValue === null;
  previous.addEventListener("toggle", () => {
    if (!isCurrent() || !previous.open || previous.childElementCount > 1) return;
    let text = String(copy.previousValue ?? "");
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Keep original text readable. */ }
    previous.append(node("pre", text));
  });
  container.append(previous, check, status, explanation, remove);
}
