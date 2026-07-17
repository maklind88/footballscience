export function normalizeMedicalRtpClinicalQuery(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("/", " ")
    .replaceAll("-", " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMedicalRtpClinicalQueryTerms(query = "") {
  return normalizeMedicalRtpClinicalQuery(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

const weightedDatasetFields = Object.freeze([
  ["profileName", 60],
  ["clinicalSymptoms", 42],
  ["clinicalBodyArea", 38],
  ["clinicalMechanism", 34],
  ["clinicalRedFlags", 32],
  ["clinicalTissue", 28],
  ["clinicalMovement", 24],
  ["clinicalPositionDemand", 22],
  ["search", 10],
  ["clinicalSearch", 8],
]);

function normalizedDatasetValue(card = {}, field = "") {
  return normalizeMedicalRtpClinicalQuery(card.dataset?.[field] || "");
}

export function getMedicalRtpClinicalCardHaystack(card = {}) {
  return normalizeMedicalRtpClinicalQuery(
    weightedDatasetFields.map(([field]) => card.dataset?.[field]).filter(Boolean).join(" ")
  );
}

export function scoreMedicalRtpClinicalCard(card = {}, query = "") {
  const normalizedQuery = normalizeMedicalRtpClinicalQuery(query);
  if (!normalizedQuery) return 0;
  const terms = getMedicalRtpClinicalQueryTerms(normalizedQuery);
  const haystack = getMedicalRtpClinicalCardHaystack(card);
  if (!terms.length || !terms.every((term) => haystack.includes(term))) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = haystack.includes(normalizedQuery) ? 20 : 0;
  weightedDatasetFields.forEach(([field, weight]) => {
    const value = normalizedDatasetValue(card, field);
    if (!value) return;
    if (value === normalizedQuery) {
      score += weight * 3;
    } else if (value.includes(normalizedQuery)) {
      score += weight * 2;
    }
    terms.forEach((term) => {
      if (value.split(" ").includes(term)) {
        score += weight;
      } else if (value.includes(term)) {
        score += Math.ceil(weight / 2);
      }
    });
  });
  return score;
}

export function rankMedicalRtpClinicalCards(cards = [], query = "") {
  const normalizedQuery = normalizeMedicalRtpClinicalQuery(query);
  return cards
    .map((card, index) => ({
      card,
      index: Number.isFinite(Number(card.dataset?.libraryOrder))
        ? Number(card.dataset.libraryOrder)
        : index,
      score: normalizedQuery ? scoreMedicalRtpClinicalCard(card, normalizedQuery) : 0,
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((first, second) =>
      normalizedQuery
        ? second.score - first.score || first.index - second.index
        : first.index - second.index
    );
}
