export const defaultReviewSections = Object.freeze([
  { id: "team-meeting", title: "Team Meeting", type: "team-meeting", note: "", items: [] },
  { id: "unit-meeting", title: "Unit Meeting", type: "unit-meeting", note: "", items: [] },
  { id: "player-review", title: "Player Review", type: "player-review", note: "", items: [] },
]);

export function createReviewSections() {
  return defaultReviewSections.map((section) => ({ ...section, items: [] }));
}

export function addClipToReviewSection(sections = [], sectionId = "team-meeting", clipId = "") {
  if (!clipId) return sections;
  return sections.map((section) => {
    if (section.id !== sectionId) return section;
    if ((section.items || []).some((item) => item.clipId === clipId)) return section;
    return { ...section, items: [...(section.items || []), { clipId, note: "" }] };
  });
}

export function removeClipFromReviewSection(sections = [], sectionId = "", clipId = "") {
  return sections.map((section) => (
    section.id === sectionId
      ? { ...section, items: (section.items || []).filter((item) => item.clipId !== clipId) }
      : section
  ));
}

export function updateReviewSectionNote(sections = [], sectionId = "", note = "") {
  return sections.map((section) => (section.id === sectionId ? { ...section, note } : section));
}

export function buildReviewSessionPayload(state = {}) {
  const sections = (state.reviewSections || []).map((section, sectionIndex) => ({
    title: section.title,
    type: section.type,
    note: section.note || "",
    sortOrder: sectionIndex,
    items: (section.items || []).map((item, itemIndex) => ({
      clipId: item.clipId,
      note: item.note || "",
      sortOrder: itemIndex,
    })),
  }));
  return {
    title: state.reviewTitle || "Football Science Review",
    purpose: state.activeReviewSectionId || "team-meeting",
    playerId: state.filters?.playerId || "",
    unit: state.filters?.unit || "",
    sections,
  };
}
