import { escapeHtml } from "../components/renderHelpers.js";
import { playerHeaderIcon } from "../components/playerHeaderIcons.js";
import { miniGamePrinciples } from "../constants/miniGamePrinciples.js";
import { clipMiniGamePrincipleIds } from "../services/miniGamePrincipleService.js";

const searchKey = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function renderClipPrincipleTool(clip) {
  const count = clipMiniGamePrincipleIds(clip).length;
  return `<button type="button" class="video-analysis-clip-principles-tool" data-clip-principles-open
    aria-label="MG Principles" title="MG Principles" aria-haspopup="dialog" aria-expanded="false"
    aria-controls="video-analysis-clip-principles-dialog">${playerHeaderIcon("tags")}
    <span data-video-analysis-principle-count aria-hidden="true" ${count ? "" : "hidden"}>${count}</span></button>`;
}

export function renderClipPrinciples(clip, canEdit) {
  const selected = new Set(clipMiniGamePrincipleIds(clip));
  const choices = [...miniGamePrinciples].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))
    || a.label.localeCompare(b.label));
  return `<dialog id="video-analysis-clip-principles-dialog" class="video-analysis-clip-editor__edit-dialog video-analysis-clip-principles" aria-labelledby="video-analysis-clip-principles-title">
    <header><h2 id="video-analysis-clip-principles-title">MG Principles</h2>
      <button type="button" data-clip-principles-back aria-label="Back to video" title="Back to video">${playerHeaderIcon("x")}</button></header>
    <div class="video-analysis-clip-principles__search">
      <input type="search" data-clip-principles-search aria-label="Search MG Principles" placeholder="Search MG Principles" autocomplete="off" aria-controls="video-analysis-clip-principles-list">
      <span data-clip-principles-results role="status"></span>
    </div>
    <fieldset id="video-analysis-clip-principles-list" class="video-analysis-clip-principles__list" aria-label="MG Principles" ${canEdit ? "" : "disabled"}>
      ${choices.map(principle => `<label data-clip-principle-option data-search="${escapeHtml(searchKey(`${principle.label} ${principle.group}`))}">
        <input type="checkbox" data-video-analysis-timeline-edit-principle value="${escapeHtml(principle.id)}" ${selected.has(principle.id) ? "checked" : ""}>
        <span>${escapeHtml(principle.label)}<small>${escapeHtml(principle.group)}</small></span>
      </label>`).join("")}
    </fieldset>
    <p class="video-analysis-clip-editor__error" role="alert" hidden></p>
    <footer><span data-clip-principles-selected>${selected.size} selected</span>
      <button type="button" data-clip-principles-back>Back</button>
      ${canEdit ? '<button type="submit" class="video-analysis-clip-editor__save" data-clip-principles-save>Apply</button>' : ""}
    </footer>
  </dialog>`;
}

export function updateClipPrincipleCount(dialog) {
  const count = dialog.querySelectorAll("[data-video-analysis-timeline-edit-principle]:checked").length;
  const badge = dialog.querySelector("[data-video-analysis-principle-count]");
  badge.textContent = count;
  badge.hidden = !count;
  dialog.querySelector("[data-clip-principles-open]").setAttribute("aria-description", `${count} selected`);
  dialog.querySelector("[data-clip-principles-selected]").textContent = `${count} selected`;
}

export function bindClipPrincipleSearch(dialog) {
  const search = dialog.querySelector("[data-clip-principles-search]");
  search.addEventListener("input", () => {
    const words = searchKey(search.value).trim().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const option of dialog.querySelectorAll("[data-clip-principle-option]")) {
      option.hidden = !words.every(word => option.dataset.search.includes(word));
      if (!option.hidden) count += 1;
    }
    dialog.querySelector("[data-clip-principles-results]").textContent = words.length ? count ? `${count} results` : "No matching principles" : "";
  });
  search.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });
  updateClipPrincipleCount(dialog);
}
