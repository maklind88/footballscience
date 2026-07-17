import {
  getMedicalRtpExerciseBankSearchText,
  getMedicalRtpExerciseCatalogItems,
  medicalRtpExerciseBankFilterOptions,
} from "./medical-rtp-exercise-bank-data.mjs";
import { renderMedicalRtpExerciseThumbnail } from "./medical-rtp-exercise-diagram-renderer.mjs";

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const compactJoin = (items = [], limit = 2, fallback = "") => {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean).slice(0, limit);
  return list.length ? list.join(" / ") : fallback;
};

export function createMedicalRtpExerciseCatalogRenderer({ escapeHtml = defaultEscapeHtml } = {}) {
  const renderSelect = (label, key, options = []) => `
<label>
<span>${escapeHtml(label)}</span>
<select data-medical-rtp-exercise-filter="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">
<option value="all">All</option>
${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
</select>
</label>
`;

  const renderExerciseCard = (exercise = {}) => {
    const searchText = getMedicalRtpExerciseBankSearchText(exercise);
    const thumbnail = exercise.thumbnail || {};
    const linkedCount = Array.isArray(exercise.linkedProfiles) ? exercise.linkedProfiles.length : 0;
    return `
<article
class="medical-rtp-exercise-catalog-card medical-rtp-exercise-${escapeHtml(exercise.riskLevel)}"
data-medical-rtp-exercise
data-search="${escapeHtml(searchText)}"
data-phase="${escapeHtml((exercise.phases || []).join(" "))}"
data-tissue="${escapeHtml((exercise.tissueTypes || []).join(" "))}"
data-demand="${escapeHtml((exercise.footballDemands || []).join(" "))}"
data-risk="${escapeHtml(exercise.riskLevel || "")}"
>
<div class="medical-rtp-exercise-thumb" aria-label="${escapeHtml(thumbnail.altText || `${exercise.name} thumbnail`)}">
${renderMedicalRtpExerciseThumbnail(exercise, escapeHtml)}
<small>${escapeHtml(exercise.mediaStatus === "uploaded" ? "Quality-assured media" : "Technique diagram")}</small>
</div>
<div class="medical-rtp-exercise-catalog-body">
<header>
<span>${escapeHtml(compactJoin(exercise.phases, 2, "phase"))}</span>
<strong>${escapeHtml(exercise.name)}</strong>
</header>
<p>${escapeHtml(exercise.intent)}</p>
<div class="medical-rtp-exercise-meta">
<span>${escapeHtml(compactJoin(exercise.tissueTypes, 2, "tissue"))}</span>
<span>${escapeHtml(compactJoin(exercise.footballDemands, 2, "football demand"))}</span>
<span>${escapeHtml(exercise.riskLevel || "risk")}</span>
</div>
<div class="medical-rtp-exercise-program-row">
<span><strong>Gate</strong>${escapeHtml(exercise.programBuilder?.gateCriteria?.[0] || "Stable symptoms and quality")}</span>
<span><strong>Next</strong>${escapeHtml(exercise.programBuilder?.nextExposure || exercise.progression || "Progress after review")}</span>
</div>
<footer>
<small>${escapeHtml(linkedCount ? `${linkedCount} linked profiles` : "Profile linking ready")}</small>
<small>${escapeHtml(exercise.evidenceLevel || "Evidence level")}</small>
</footer>
</div>
</article>
`;
  };

  const renderExerciseCatalog = () => {
    const exercises = getMedicalRtpExerciseCatalogItems();
    return `
<section class="medical-rtp-exercise-catalog" data-medical-rtp-exercise-catalog aria-label="RTP Exercise Bank">
<header>
<div>
<span>RTP Exercise Bank</span>
<strong>Professional exercise catalogue</strong>
<small>Search by tissue, phase, movement demand and profile-linked RTP use. Media loads as metadata first, never as heavy frontend payload.</small>
</div>
<b>${escapeHtml(String(exercises.length))} exercises</b>
</header>
<form class="medical-rtp-exercise-controls" data-medical-rtp-exercise-controls>
<label class="medical-rtp-library-search">
<span>Exercise search</span>
<input type="search" data-medical-rtp-exercise-search placeholder="Search exercise, tissue, phase, demand, equipment or gate" />
</label>
${renderSelect("Tissue", "tissue", medicalRtpExerciseBankFilterOptions.tissueTypes)}
${renderSelect("Phase", "phase", medicalRtpExerciseBankFilterOptions.phases)}
${renderSelect("Risk", "risk", medicalRtpExerciseBankFilterOptions.riskLevels)}
</form>
<div class="medical-rtp-library-meta">
<span><strong data-medical-rtp-exercise-count>${escapeHtml(String(exercises.length))}</strong> exercises visible</span>
<span>Every card is Medical-safe and can feed Medical Plan starters without becoming player-specific data.</span>
</div>
<div class="medical-rtp-exercise-catalog-grid">
${exercises.map(renderExerciseCard).join("")}
</div>
<div class="medical-empty-inline medical-rtp-exercise-empty" data-medical-rtp-exercise-empty hidden>No RTP exercises match the current search and filters.</div>
</section>
`;
  };

  return {
    renderExerciseCatalog,
  };
}
