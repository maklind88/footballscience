import { selectedTrackingItem } from "../controllers/trackingControllerHelpers.js";
import { buildLocalVideoHandleIdentity } from "./localVideoSessionService.js";
import { createLocalTrackingWorkspaceScope } from "./localTrackingWorkspaceContract.js";

function currentUser(context = {}) {
  return context.currentUser || context.user || context.getCurrentPlatformUser?.() || {};
}

export function trackingWorkspaceUserId(context = {}) {
  const user = currentUser(context);
  return String(
    user.id || user.userId || user.user_id || user.authId || user.auth_id || user.profileId || user.profile_id || "",
  ).trim();
}

export function trackingWorkspaceTarget(state = {}, context = {}) {
  const item = selectedTrackingItem(state);
  const clipId = String(item?.clipId || "").trim();
  if (!item || !clipId) return null;
  let scope = null;
  try {
    const userId = trackingWorkspaceUserId(context);
    if (userId) {
      const clip = item.clip || {};
      const identity = buildLocalVideoHandleIdentity(state, context, {
        userId,
        matchId: clip.matchId || clip.match_id || state.match?.id,
        videoId: clip.videoId || clip.video_id || state.video?.id,
      });
      if (identity.organizationId !== "local" && identity.teamId !== "team") {
        scope = createLocalTrackingWorkspaceScope({ ...identity, clipId });
      }
    }
  } catch {
    scope = null;
  }
  return {
    itemId: item.id,
    clipId,
    scope,
    key: `${item.id}::${clipId}::${scope?.id || "central-only"}`,
  };
}
