export function createPlaylistRepository() {
  return {
    saveReviewList(items = []) {
      return Promise.resolve({ items });
    },
  };
}
