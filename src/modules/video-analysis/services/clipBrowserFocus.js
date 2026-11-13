export function preserveClipBrowserFocus(root) {
  const focused = root.querySelector(":focus");
  const attribute = [
    "data-video-analysis-timeline-category-label", "data-video-analysis-seek",
    "data-playlist-library-open", "data-playlist-library-sort", "data-playlist-library-page",
  ].find(name => focused?.hasAttribute(name));
  if (!attribute) return () => {};
  const value = focused.getAttribute(attribute);
  const rowKey = focused.closest(".video-analysis-lane")?.dataset.videoAnalysisRowKey;
  return () => {
    const target = [...root.querySelectorAll(`[${attribute}]`)].find(element =>
      element.getAttribute(attribute) === value
      && element.closest(".video-analysis-lane")?.dataset.videoAnalysisRowKey === rowKey);
    target?.focus({ preventScroll: true });
  };
}
