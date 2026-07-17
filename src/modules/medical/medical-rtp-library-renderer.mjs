import {
  getMedicalRtpLibraryClinicalSearchGroups,
  getMedicalRtpLibraryClinicalSearchText,
  getMedicalRtpLibrarySearchText,
  medicalRtpLibraryProfiles as defaultMedicalRtpLibraryProfiles,
} from "./medical-rtp-library-data.mjs";

export const MEDICAL_RTP_LIBRARY_PAGE_SIZE = 24;

const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const movementDemandOptions = Object.freeze([
  { label: "All demands", value: "all" },
  { label: "Sprinting", value: "sprint|max velocity|high-speed running" },
  { label: "Acceleration", value: "acceleration" },
  { label: "Deceleration", value: "deceleration|braking" },
  { label: "Change of direction", value: "cod|cutting|change of direction" },
  { label: "Jumping / landing", value: "jump|landing" },
  { label: "Contact", value: "contact|duel" },
  { label: "Running", value: "running" },
  { label: "Kicking", value: "kicking" },
  { label: "Rotation", value: "rotation|transverse" },
  { label: "Strength", value: "strength" },
  { label: "Football integration", value: "football integration|match exposure" },
]);

const commonGuideIds = Object.freeze([
  "acl-reconstruction-rtp",
  "hamstring-strain",
  "lateral-ankle-sprain",
]);

const renderEvidenceBadge = (profile = {}, escapeHtml = defaultEscapeHtml) =>
  `<span class="medical-rtp-evidence-badge">${escapeHtml(profile.evidenceLevel || "Evidence not set")}</span>`;

const renderGuideButton = (profile = {}, escapeHtml = defaultEscapeHtml, className = "") => `
<button
type="button"
class="${escapeHtml(className)}"
data-medical-open-rtp-profile="${escapeHtml(profile.id)}"
aria-haspopup="dialog"
aria-controls="medical-rtp-profile-dialog"
>
<span>
<strong>${escapeHtml(profile.name)}</strong>
<small>${escapeHtml(profile.bodyArea)} / ${escapeHtml(profile.system)}</small>
</span>
${renderEvidenceBadge(profile, escapeHtml)}
</button>
`;

const renderProfileCard = (profile = {}, index = 0, escapeHtml = defaultEscapeHtml) => {
  const searchText = getMedicalRtpLibrarySearchText(profile);
  const clinicalSearchText = getMedicalRtpLibraryClinicalSearchText(profile);
  const clinicalGroups = getMedicalRtpLibraryClinicalSearchGroups(profile);
  return `
<article
class="medical-rtp-profile-card"
data-medical-rtp-profile
data-search="${escapeHtml(searchText)}"
data-clinical-search="${escapeHtml(clinicalSearchText)}"
data-clinical-symptoms="${escapeHtml(clinicalGroups.symptoms.join(" "))}"
data-clinical-body-area="${escapeHtml(clinicalGroups.bodyArea.join(" "))}"
data-clinical-mechanism="${escapeHtml(clinicalGroups.mechanism.join(" "))}"
data-clinical-red-flags="${escapeHtml(clinicalGroups.redFlags.join(" "))}"
data-clinical-movement="${escapeHtml(clinicalGroups.movementPlane.join(" "))}"
data-clinical-tissue="${escapeHtml(clinicalGroups.tissueType.join(" "))}"
data-clinical-position-demand="${escapeHtml(clinicalGroups.positionDemand.join(" "))}"
data-movement="${escapeHtml(profile.movementPlanes.join(" "))}"
data-position="${escapeHtml(profile.positions.join(" "))}"
data-season="${escapeHtml(profile.season.join(" "))}"
data-sex="${escapeHtml(profile.sex.join(" "))}"
data-level="${escapeHtml(profile.level.join(" "))}"
${index >= MEDICAL_RTP_LIBRARY_PAGE_SIZE ? "hidden" : ""}
>
<button
type="button"
class="medical-rtp-profile-trigger"
data-medical-open-rtp-profile="${escapeHtml(profile.id)}"
aria-haspopup="dialog"
aria-controls="medical-rtp-profile-dialog"
>
<span class="medical-rtp-profile-result-main">
<strong>${escapeHtml(profile.name)}</strong>
<small>${escapeHtml(profile.summary)}</small>
</span>
<span class="medical-rtp-profile-result-meta">${escapeHtml(profile.system)} / ${escapeHtml(profile.bodyArea)}</span>
${renderEvidenceBadge(profile, escapeHtml)}
<b aria-hidden="true">›</b>
</button>
</article>
`;
};

const renderProfileModal = () => `
<div class="medical-rtp-profile-modal" data-medical-rtp-profile-modal hidden aria-hidden="true">
<button type="button" class="medical-rtp-profile-modal-backdrop" data-medical-close-rtp-profile aria-label="Close RTP guide"></button>
<section
id="medical-rtp-profile-dialog"
class="medical-rtp-profile-dialog"
role="dialog"
aria-modal="true"
aria-labelledby="medical-rtp-profile-title"
tabindex="-1"
>
<div class="medical-rtp-profile-dialog-content" data-medical-rtp-profile-dialog-content>
<header>
<div>
<span>RTP guide</span>
<h3 id="medical-rtp-profile-title">RTP injury guide</h3>
<small>Select a guide from the library.</small>
</div>
<button type="button" class="medical-rtp-profile-modal-close" data-medical-close-rtp-profile aria-label="Close RTP guide">Close</button>
</header>
<div class="medical-rtp-profile-dialog-body">
<div class="medical-empty-inline">Select an RTP injury guide to open the clinical decision support.</div>
</div>
</div>
</section>
</div>
`;

const renderGuideAuthoringModal = () => `
<div class="medical-rtp-profile-modal" data-medical-rtp-guide-draft-modal hidden aria-hidden="true">
<button type="button" class="medical-rtp-profile-modal-backdrop" data-medical-close-rtp-guide-draft aria-label="Close injury guide draft"></button>
<section
id="medical-rtp-guide-draft-dialog"
class="medical-rtp-profile-dialog medical-rtp-guide-authoring-dialog"
role="dialog"
aria-modal="true"
aria-labelledby="medical-rtp-guide-draft-title"
tabindex="-1"
>
<header>
<div>
<span>Medical authoring</span>
<h3 id="medical-rtp-guide-draft-title">Create guide draft</h3>
<small>Prepare a governed RTP Library contribution without publishing from the browser.</small>
</div>
<button type="button" class="medical-rtp-profile-modal-close" data-medical-close-rtp-guide-draft aria-label="Close injury guide draft">Close</button>
</header>
<div class="medical-rtp-profile-dialog-body">
<div class="medical-rtp-guide-authoring-body">
<section class="medical-rtp-guide-authoring-panel">
<h4>Draft workflow</h4>
<div class="medical-rtp-guide-status-strip">
<span><strong>1</strong> Medical draft</span>
<span><strong>2</strong> Performance review</span>
<span><strong>3</strong> Governance approval</span>
<span><strong>4</strong> Published guide</span>
</div>
<p>Permanent saving needs the guarded RTP Library API, RLS and audit events before custom guides become shared knowledge.</p>
</section>
<section class="medical-rtp-guide-authoring-panel">
<h4>Guide fields</h4>
<div class="medical-rtp-guide-field-grid">
<span>Injury name</span>
<span>System / body area</span>
<span>Movement / demand</span>
<span>Symptoms and risk tags</span>
<span>Evidence level</span>
<span>Quick summary</span>
<span>Red flags</span>
<span>Progression criteria</span>
<span>Training checklist</span>
<span>Match checklist</span>
<span>Common mistakes</span>
<span>Medical / Performance notes</span>
</div>
</section>
<section class="medical-rtp-guide-authoring-panel">
<h4>Authoring template</h4>
<p>Use the locked Gold Standard template until governed draft saving is enabled.</p>
<div class="medical-rtp-guide-actions">
<button type="button" data-medical-copy-rtp-guide-template>Copy guide template</button>
<small>No custom guide is saved from the browser in this phase.</small>
</div>
</section>
</div>
</div>
</section>
</div>
`;

export function createMedicalRtpLibraryRenderer({
  escapeHtml = defaultEscapeHtml,
  getMedicalRtpLibraryProfiles = () => defaultMedicalRtpLibraryProfiles,
} = {}) {
  const renderRtpLibrary = () => {
    const profiles = getMedicalRtpLibraryProfiles();
    const commonProfiles = commonGuideIds
      .map((profileId) => profiles.find((profile) => profile.id === profileId))
      .filter(Boolean);
    return `
<div
class="medical-rtp-library medical-rtp-library-v2"
data-medical-rtp-library
data-medical-rtp-library-limit="${MEDICAL_RTP_LIBRARY_PAGE_SIZE}"
>
<header class="medical-rtp-library-toolbar">
<div>
<span>RTP Library</span>
<strong>Injury guides</strong>
<small>Find the clinical decision support first. Open full detail only when it is needed.</small>
</div>
<button type="button" data-medical-open-rtp-guide-draft>Create guide draft</button>
</header>
<form class="medical-rtp-library-controls" data-medical-rtp-library-controls>
<label class="medical-rtp-library-search">
<span>Clinical search</span>
<input type="search" data-medical-rtp-library-search placeholder="Symptom, body area, mechanism, red flag or position demand" />
</label>
<label>
<span>Movement / demand</span>
<select data-medical-rtp-library-filter="movement" aria-label="Movement / demand">
${movementDemandOptions
  .map(({ label, value }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
  .join("")}
</select>
</label>
</form>
${commonProfiles.length ? `
<section class="medical-rtp-common-guides" aria-label="Common football guides">
<header>
<strong>Common football guides</strong>
<small>Quick access to frequent RTP decisions</small>
</header>
<div>
${commonProfiles.map((profile) => renderGuideButton(profile, escapeHtml, "medical-rtp-common-guide")).join("")}
</div>
</section>
` : ""}
<div class="medical-rtp-library-meta">
<span><strong data-medical-rtp-library-count>${profiles.length}</strong> approved guides</span>
<span><strong data-medical-rtp-library-shown>${Math.min(MEDICAL_RTP_LIBRARY_PAGE_SIZE, profiles.length)}</strong> shown / sorted by relevance</span>
</div>
<div class="medical-rtp-profile-grid" data-medical-rtp-library-results>
${profiles.map((profile, index) => renderProfileCard(profile, index, escapeHtml)).join("")}
</div>
<button type="button" class="medical-rtp-library-more" data-medical-rtp-library-more>
Load ${Math.min(MEDICAL_RTP_LIBRARY_PAGE_SIZE, Math.max(0, profiles.length - MEDICAL_RTP_LIBRARY_PAGE_SIZE))} more
</button>
${renderProfileModal()}
${renderGuideAuthoringModal()}
<div class="medical-empty-inline medical-rtp-library-empty" data-medical-rtp-library-empty hidden>No RTP injury guides match the current search and filters.</div>
</div>
`;
  };

  return {
    renderRtpLibrary,
  };
}
