function getClientEditHint(context = {}) {
  try {
    return typeof context.canEdit === "function" ? Boolean(context.canEdit()) : Boolean(context.canEdit);
  } catch {
    return false;
  }
}

export function getLeaderboardAccess(data = {}) {
  const source = data?.access;
  if (!source || typeof source !== "object") return null;
  return Object.freeze({
    canView: source.canView === true,
    canAward: source.canAward === true,
    canReverse: source.canReverse === true,
  });
}

export function canAwardLeaderboard(state = {}, context = {}) {
  const access = getLeaderboardAccess(state?.data || {});
  if (access) return access.canAward;
  return context.requireServerAccess === true ? false : getClientEditHint(context);
}
