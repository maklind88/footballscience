export function addClipToReviewList(reviewList = [], clipId = "") {
  const id = String(clipId || "");
  if (!id || reviewList.some((item) => item.clipId === id)) return reviewList;
  return [...reviewList, { clipId: id, sortOrder: reviewList.length, customNote: "" }];
}

export function removeClipFromReviewList(reviewList = [], clipId = "") {
  return reviewList
    .filter((item) => item.clipId !== clipId)
    .map((item, index) => ({ ...item, sortOrder: index }));
}
