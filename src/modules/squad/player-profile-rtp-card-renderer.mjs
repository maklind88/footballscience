const defaultEscapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const RTP_CARD_EMPTY_MESSAGE = "No coach-safe RTP status available";
const RTP_READINESS_LABEL = "Progression score – not clearance";

const TRAINING_LABELS = Object.freeze({
  no: "No",
  modified: "Modified",
  yes: "Yes",
  unknown: "Unknown",
});

const MATCH_LABELS = Object.freeze({
  no: "No",
  limited: "Limited",
  yes: "Yes",
  unknown: "Unknown",
});

const RISK_LABELS = Object.freeze({
  low: "Low",
  moderate: "Moderate",
  high: "High",
  unknown: "Unknown",
});

const MINUTES_GUIDANCE_LABELS = Object.freeze({
  none: "None",
  low: "Low",
  moderate: "Moderate",
  normal: "Normal",
  unknown: "Unknown",
});

const POSITION_READINESS_LABELS = Object.freeze({
  "not-ready": "Not ready",
  partial: "Partial",
  "near-ready": "Near ready",
  ready: "Ready",
  unknown: "Unknown",
});

function normalizeText(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeEnum(value, labels, fallback = "unknown") {
  const normalized = normalizeText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(labels, normalized) ? normalized : fallback;
}

function normalizeArray(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 6);
}

export function normalizePlayerProfileRtpCoachStatus(payload = {}, playerId = "") {
  const statusCard = payload?.statusCard && typeof payload.statusCard === "object" ? payload.statusCard : {};
  const readiness = payload?.readiness && typeof payload.readiness === "object" ? payload.readiness : {};
  const caseStatus = payload?.case && typeof payload.case === "object" ? payload.case : {};
  const normalizedPlayerId = normalizeText(payload?.playerId || playerId);
  const hasActiveRtpCase = Boolean(caseStatus.hasActiveRtpCase);

  return {
    contractVersion: normalizeText(payload?.contractVersion),
    scope: normalizeText(payload?.scope, "coach-safe"),
    playerId: normalizedPlayerId,
    hasActiveRtpCase,
    empty: Boolean(payload?.emptyState) || !hasActiveRtpCase,
    statusCard: {
      canTrainToday: normalizeEnum(statusCard.canTrainToday, TRAINING_LABELS),
      canPlayNextMatch: normalizeEnum(statusCard.canPlayNextMatch, MATCH_LABELS),
      riskLevel: normalizeEnum(statusCard.riskLevel, RISK_LABELS),
      minutesGuidanceBand: normalizeEnum(statusCard.minutesGuidanceBand, MINUTES_GUIDANCE_LABELS),
      restrictions: normalizeArray(statusCard.restrictions),
      positionReadinessBand: normalizeEnum(statusCard.positionReadinessBand, POSITION_READINESS_LABELS),
      nextDecisionPoint: normalizeText(statusCard.nextDecisionPoint),
    },
    readiness: {
      label: RTP_READINESS_LABEL,
      band: normalizeText(readiness.band, "insufficient-data"),
      bandLabel: normalizeText(readiness.bandLabel, "Insufficient data"),
      status: normalizeText(readiness.status, "insufficient-data"),
      dataCompleteness: normalizeText(readiness.dataCompleteness, "insufficient"),
    },
    case: {
      rtpStage: normalizeText(caseStatus.rtpStage || caseStatus.mostRestrictiveStatus, "unknown"),
      lastUpdatedAt: normalizeText(caseStatus.lastUpdatedAt),
    },
  };
}

function renderMetric(label, value, escapeHtml) {
  return `
    <div class="squad-snapshot-card" data-player-profile-rtp-metric="${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

export function renderPlayerProfileRtpStatusCard(payload = null, options = {}) {
  const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : defaultEscapeHtml;
  const playerId = normalizeText(payload?.playerId || options.playerId);
  const status = normalizePlayerProfileRtpCoachStatus(payload || {}, playerId);

  if (status.empty) {
    return `
      <article
        class="squad-profile-section squad-rtp-status-card is-empty"
        data-player-profile-rtp-card
        data-player-profile-rtp-card-player-id="${escapeHtml(status.playerId)}"
      >
        <header class="squad-section-head">
          <div>
            <p>RTP Status</p>
            <h2>${escapeHtml(RTP_CARD_EMPTY_MESSAGE)}</h2>
          </div>
        </header>
        <p class="squad-profile-empty-note">${escapeHtml(RTP_READINESS_LABEL)}</p>
      </article>
    `;
  }

  const card = status.statusCard;
  const restrictions = card.restrictions.length
    ? `<p class="squad-profile-empty-note">${card.restrictions.map((entry) => escapeHtml(entry)).join(" · ")}</p>`
    : `<p class="squad-profile-empty-note">No coach-safe restrictions shared</p>`;
  const nextDecisionPoint = card.nextDecisionPoint
    ? `<p class="squad-profile-empty-note">Next decision point: ${escapeHtml(card.nextDecisionPoint)}</p>`
    : "";

  return `
    <article
      class="squad-profile-section squad-rtp-status-card"
      data-player-profile-rtp-card
      data-player-profile-rtp-card-player-id="${escapeHtml(status.playerId)}"
    >
      <header class="squad-section-head">
        <div>
          <p>RTP Status</p>
          <h2>Coach-safe status</h2>
        </div>
        <span>${escapeHtml(status.readiness.label)}</span>
      </header>
      <div class="squad-snapshot-grid" aria-label="Coach-safe RTP status">
        ${renderMetric("Can train today", TRAINING_LABELS[card.canTrainToday], escapeHtml)}
        ${renderMetric("Can play next match", MATCH_LABELS[card.canPlayNextMatch], escapeHtml)}
        ${renderMetric("Risk level", RISK_LABELS[card.riskLevel], escapeHtml)}
        ${renderMetric("Minutes guidance", MINUTES_GUIDANCE_LABELS[card.minutesGuidanceBand], escapeHtml)}
        ${renderMetric("Position readiness", POSITION_READINESS_LABELS[card.positionReadinessBand], escapeHtml)}
        ${renderMetric("Readiness band", status.readiness.bandLabel, escapeHtml)}
      </div>
      ${restrictions}
      ${nextDecisionPoint}
    </article>
  `;
}
