export function normalizeReviewList(value = {}) {
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    id: String(value.id || "current-review"),
    title: String(value.title || "Review list"),
    items: items
      .map((item, index) => ({
        clipId: String(item.clipId || item.clip_instance_id || item.id || ""),
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        customNote: String(item.customNote || item.custom_note || ""),
      }))
      .filter((item) => item.clipId),
  };
}
