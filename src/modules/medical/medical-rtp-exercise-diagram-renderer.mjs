const safeMediaUrl = (value = "") => {
  const url = String(value || "").trim();
  return /^(https:\/\/|\/(?!\/))/i.test(url) ? url : "";
};

const diagramShapes = Object.freeze({
  "posterior-chain-bridge": { body: "M34 70 L58 54 L92 56 L124 74", motion: "M54 44 Q84 24 114 48", focus: [82, 57] },
  "frontal-plane-adduction": { body: "M80 28 L80 62 M80 42 L48 57 M80 42 L112 57 M80 62 L54 90 M80 62 L108 90", motion: "M40 70 Q80 94 120 70", focus: [80, 66] },
  "calf-achilles-loading": { body: "M70 24 L76 58 L70 88 M76 58 L104 88", motion: "M54 82 Q76 56 98 82", focus: [74, 78] },
  "energy-storage-contacts": { body: "M78 22 L80 57 M80 40 L58 54 M80 40 L104 54 M80 57 L62 84 M80 57 L100 84", motion: "M42 86 Q80 52 118 86", focus: [80, 84] },
  "knee-dominant-loading": { body: "M78 22 L80 54 M80 38 L54 54 M80 38 L108 54 M80 54 L58 72 L70 92 M80 54 L106 72 L96 92", motion: "M42 68 Q80 96 120 68", focus: [59, 73] },
  "braking-mechanics": { body: "M66 24 L78 52 M74 38 L48 52 M74 38 L102 48 M78 52 L52 82 M78 52 L112 76", motion: "M28 88 Q76 70 132 84", focus: [54, 80] },
  "field-running-exposure": { body: "M70 24 L82 52 M76 38 L48 54 M76 38 L108 42 M82 52 L54 82 M82 52 L116 72", motion: "M24 90 Q76 62 136 78", focus: [111, 72] },
  "football-ball-exposure": { body: "M70 24 L78 56 M76 40 L52 58 M76 40 L104 52 M78 56 L54 84 M78 56 L112 82", motion: "M98 84 Q122 66 140 74", focus: [126, 82] },
  "upper-body-contact-control": { body: "M78 24 L80 60 M80 40 L42 52 M80 40 L120 50 M80 60 L62 90 M80 60 L100 90", motion: "M38 36 Q80 18 124 36", focus: [112, 49] },
  "goalkeeper-save-landing": { body: "M50 48 L82 56 M62 52 L38 26 M62 52 L92 30 M82 56 L108 76 M82 56 L58 82", motion: "M28 76 Q76 22 130 50", focus: [110, 75] },
  "medical-governed-exertion": { body: "M80 24 L80 58 M80 40 L56 56 M80 40 L104 56 M80 58 L62 88 M80 58 L98 88", motion: "M44 90 Q80 72 116 90", focus: [80, 42] },
  "surgical-re-entry": { body: "M80 24 L80 58 M80 40 L56 56 M80 40 L104 56 M80 58 L62 88 M80 58 L98 88", motion: "M46 78 L114 78", focus: [80, 60] },
});

export function renderMedicalRtpExerciseThumbnail(exercise = {}, escapeHtml = (value) => String(value ?? "")) {
  const thumbnail = exercise.thumbnail || {};
  const imageUrl = safeMediaUrl(thumbnail.url);
  const altText = thumbnail.altText || `${exercise.name || "RTP exercise"} thumbnail`;
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async" />`;
  }

  const key = String(thumbnail.diagramKey || "medical-governed-exertion");
  const shape = diagramShapes[key] || diagramShapes["medical-governed-exertion"];
  return `
<svg class="medical-rtp-exercise-diagram" viewBox="0 0 160 110" role="img" aria-label="${escapeHtml(altText)}">
  <rect x="1" y="1" width="158" height="108" rx="10" class="medical-rtp-diagram-surface" />
  <path d="M18 92 H142 M26 18 V92 M134 18 V92" class="medical-rtp-diagram-grid" />
  <circle cx="${shape.focus[0]}" cy="${shape.focus[1]}" r="13" class="medical-rtp-diagram-focus" />
  <circle cx="78" cy="17" r="7" class="medical-rtp-diagram-athlete" />
  <path d="${shape.body}" class="medical-rtp-diagram-athlete" />
  <path d="${shape.motion}" class="medical-rtp-diagram-motion" />
  <circle cx="28" cy="91" r="3" class="medical-rtp-diagram-marker" />
  <circle cx="132" cy="91" r="3" class="medical-rtp-diagram-marker" />
</svg>`;
}
