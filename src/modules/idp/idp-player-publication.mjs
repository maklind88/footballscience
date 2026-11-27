const publishers = new Set(["admin", "club-admin", "team-admin", "coach"]);

export function renderPlayerPublication(playerId, focusTitle, options, escape) {
  if (!publishers.has(options.currentUser?.role) || !/north carolina courage/i.test(options.teamName || "")) return "";
  return `
    <article class="idp-river-panel">
      <div class="idp-section-head">
        <div><strong>My Development</strong></div>
        <button type="button" data-idp-publication-load>Load player view</button>
      </div>
      <form class="idp-action-form" data-idp-player-publication="${escape(playerId)}" hidden>
        <label>Shared focus<input name="focus" value="${escape(focusTitle || "")}" required maxlength="180"></label>
        <label>Next step<textarea name="nextStep" required maxlength="800"></textarea></label>
        <label>Coach feedback<textarea name="feedback" maxlength="1200"></textarea></label>
        <button type="submit" value="publish">Publish to player</button>
        <button type="submit" value="withdraw" formnovalidate hidden>Withdraw</button>
      </form>
      <p role="status" data-idp-publication-status></p>
    </article>
  `;
}

function updateForm(form, publication) {
  form.hidden = false;
  form.dataset.revision = String(publication?.revision || 0);
  for (const name of ["focus", "nextStep", "feedback"]) {
    const field = form.elements[name];
    field.value = publication ? publication[name] || "" : field.defaultValue;
  }
  form.querySelector('[value="withdraw"]').hidden = !publication?.published;
}

export async function loadPlayerPublication(button, api) {
  if (button.disabled) return;
  const section = button.closest("article");
  const form = section.querySelector("[data-idp-player-publication]");
  const status = section.querySelector("[data-idp-publication-status]");
  button.disabled = true;
  form.hidden = true;
  status.textContent = "Loading…";
  try {
    const { publication } = await api.loadPlayerPublication(form.dataset.idpPlayerPublication);
    updateForm(form, publication);
    status.textContent = publication?.published ? "Visible to the player." : "No focus is visible to the player.";
    button.textContent = "Reload player view";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

export async function savePlayerPublication(form, operation, api) {
  if (form.dataset.saving === "true") return;
  const section = form.closest("article");
  const status = section.querySelector("[data-idp-publication-status]");
  const controls = [...form.elements, section.querySelector("[data-idp-publication-load]")];
  const fields = Object.fromEntries(new FormData(form));
  form.dataset.saving = "true";
  for (const control of controls) control.disabled = true;
  status.textContent = "Saving…";
  try {
    const { publication } = await api.savePlayerPublication(form.dataset.idpPlayerPublication, {
      ...fields, operation, revision: Number(form.dataset.revision),
    });
    updateForm(form, publication);
    status.textContent = publication?.published ? "Visible to the player." : "Focus withdrawn.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    form.dataset.saving = "false";
    for (const control of controls) control.disabled = false;
  }
}
