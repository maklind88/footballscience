export const TRACKING_CANDIDATE_ROLE_ANCHOR_PROTOCOL = "football-science-tracking-role-anchor-v1";
export const TRACKING_CANDIDATE_TEAM_ANCHOR_PROTOCOL = "football-science-tracking-team-anchor-v1";

const roles = new Set(["player", "referee"]);
const teamSides = new Set(["home", "away"]);

function invalid(message, code = "TRACKING_CANDIDATE_ROLE_ANCHOR_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256(value = "") {
  const result = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(result) ? result : "";
}

function identifier(value = "") {
  const result = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(result) && result.length <= 160 ? result : "";
}

function trajectoryIds(value = []) {
  const ids = Array.isArray(value) ? [...new Set(value.map(identifier).filter(Boolean))].sort() : [];
  return ids.length > 0 && ids.length <= 4 ? ids : [];
}

export function createTrackingCandidateRoleAnchor(track = {}, options = {}) {
  const metadata = track.metadata || {};
  const role = String(options.role || track.entityType || "").trim().toLowerCase();
  const ids = trajectoryIds(metadata.candidateTrajectoryIds);
  const associationArtifactSha256 = sha256(metadata.candidateAssociationArtifactSha256);
  const pipelineFingerprintSha256 = sha256(metadata.candidatePipelineFingerprintSha256);
  const sourceFingerprintSha256 = sha256(metadata.localSourceSha256);
  const candidateTrack = metadata.candidatePipelineProtocol === "football-science-tracking-candidate-pipeline-v1";
  if (!candidateTrack) return null;
  if (!roles.has(role) || !ids.length || !associationArtifactSha256
    || !pipelineFingerprintSha256 || !sourceFingerprintSha256) {
    invalid("This candidate trajectory cannot become a role anchor because its evidence binding is incomplete.");
  }
  return Object.freeze({
    protocol: TRACKING_CANDIDATE_ROLE_ANCHOR_PROTOCOL,
    role,
    trajectoryIds: Object.freeze(ids),
    associationArtifactSha256,
    pipelineFingerprintSha256,
    sourceFingerprintSha256,
    confirmedAt: new Date(options.confirmedAt ?? options.correctedAt ?? Date.now()).toISOString(),
    confirmedBy: String(options.confirmedBy || options.correctedBy || "").trim().slice(0, 160),
  });
}

export function createTrackingCandidateTeamAnchor(track = {}, options = {}) {
  const metadata = track.metadata || {};
  const roleAnchor = metadata.candidateRoleAnchor || {};
  const teamSide = String(options.teamSide || track.teamSide || "").trim().toLowerCase();
  if (metadata.candidatePipelineProtocol !== "football-science-tracking-candidate-pipeline-v1") return null;
  if (track.entityType !== "player" || !teamSides.has(teamSide)
    || roleAnchor.protocol !== TRACKING_CANDIDATE_ROLE_ANCHOR_PROTOCOL
    || roleAnchor.role !== "player") return null;
  const ids = trajectoryIds(roleAnchor.trajectoryIds);
  const associationArtifactSha256 = sha256(roleAnchor.associationArtifactSha256);
  const pipelineFingerprintSha256 = sha256(roleAnchor.pipelineFingerprintSha256);
  const sourceFingerprintSha256 = sha256(roleAnchor.sourceFingerprintSha256);
  if (!ids.length || !associationArtifactSha256 || !pipelineFingerprintSha256 || !sourceFingerprintSha256) {
    invalid("This player cannot become a team anchor because its role evidence binding is incomplete.");
  }
  return Object.freeze({
    protocol: TRACKING_CANDIDATE_TEAM_ANCHOR_PROTOCOL,
    teamSide,
    trajectoryIds: Object.freeze(ids),
    associationArtifactSha256,
    pipelineFingerprintSha256,
    sourceFingerprintSha256,
    confirmedAt: new Date(options.confirmedAt ?? options.correctedAt ?? Date.now()).toISOString(),
    confirmedBy: String(options.confirmedBy || options.correctedBy || "").trim().slice(0, 160),
  });
}

function matchesScope(anchor = {}, pipelineFingerprintSha256 = "", sourceFingerprintSha256 = "") {
  return (!pipelineFingerprintSha256 || anchor.pipelineFingerprintSha256 === pipelineFingerprintSha256)
    && (!sourceFingerprintSha256 || anchor.sourceFingerprintSha256 === sourceFingerprintSha256);
}

function collectRoleAnchors(tracks = [], scope = {}, state = {}) {
  for (const track of tracks) {
    const anchor = track?.metadata?.candidateRoleAnchor;
    if (!anchor || anchor.protocol !== TRACKING_CANDIDATE_ROLE_ANCHOR_PROTOCOL) continue;
    if (!matchesScope(anchor, scope.pipelineFingerprintSha256, scope.sourceFingerprintSha256)) continue;
    if (!roles.has(anchor.role)
      || !sha256(anchor.associationArtifactSha256)
      || !sha256(anchor.pipelineFingerprintSha256)
      || !sha256(anchor.sourceFingerprintSha256)) {
      state.issues.push("A candidate role anchor has an invalid evidence binding.");
      continue;
    }
    const ids = trajectoryIds(anchor.trajectoryIds);
    if (!ids.length) {
      state.issues.push("A candidate role anchor has no reusable trajectory.");
      continue;
    }
    state.associationHashes.add(anchor.associationArtifactSha256);
    for (const trajectoryId of ids) {
      const existing = state.roleByTrajectory.get(trajectoryId);
      if (existing && existing !== anchor.role) {
        state.issues.push(`Trajectory ${trajectoryId} has conflicting role anchors.`);
        continue;
      }
      if (!existing) {
        state.roleByTrajectory.set(trajectoryId, anchor.role);
        state.roleAnchors.push({ role: anchor.role, trajectoryId });
      }
    }
  }
}

function collectTeamAnchors(tracks = [], scope = {}, state = {}) {
  for (const track of tracks) {
    const anchor = track?.metadata?.candidateTeamAnchor;
    if (!anchor || anchor.protocol !== TRACKING_CANDIDATE_TEAM_ANCHOR_PROTOCOL) continue;
    if (!matchesScope(anchor, scope.pipelineFingerprintSha256, scope.sourceFingerprintSha256)) continue;
    if (!teamSides.has(anchor.teamSide)
      || !sha256(anchor.associationArtifactSha256)
      || !sha256(anchor.pipelineFingerprintSha256)
      || !sha256(anchor.sourceFingerprintSha256)) {
      state.issues.push("A candidate team anchor has an invalid evidence binding.");
      continue;
    }
    const ids = trajectoryIds(anchor.trajectoryIds);
    if (!ids.length) {
      state.issues.push("A candidate team anchor has no reusable trajectory.");
      continue;
    }
    state.associationHashes.add(anchor.associationArtifactSha256);
    for (const trajectoryId of ids) {
      if (state.roleByTrajectory.get(trajectoryId) !== "player") {
        state.issues.push(`Team anchor ${trajectoryId} has no confirmed player role anchor.`);
        continue;
      }
      const existing = state.teamByTrajectory.get(trajectoryId);
      if (existing && existing !== anchor.teamSide) {
        state.issues.push(`Trajectory ${trajectoryId} has conflicting team anchors.`);
        continue;
      }
      if (!existing) {
        state.teamByTrajectory.set(trajectoryId, anchor.teamSide);
        state.teamAnchors.push({ teamSide: anchor.teamSide, trajectoryId });
      }
    }
  }
}

function appendAnchorLimitIssues(state = {}) {
  if (state.associationHashes.size > 1) state.issues.push("Semantic anchors belong to different association artifacts.");
  if (state.roleAnchors.length > 8) state.issues.push("At most eight role anchors may enter one candidate run.");
  if (state.teamAnchors.length > 8) state.issues.push("At most eight team anchors may enter one candidate run.");
  for (const role of roles) {
    if (state.roleAnchors.filter((anchor) => anchor.role === role).length > 4) {
      state.issues.push(`At most four ${role} role anchors may enter one candidate run.`);
    }
  }
  for (const teamSide of teamSides) {
    if (state.teamAnchors.filter((anchor) => anchor.teamSide === teamSide).length > 4) {
      state.issues.push(`At most four ${teamSide} team anchors may enter one candidate run.`);
    }
  }
}

export function trackingCandidateSemanticAnchors(tracks = [], options = {}) {
  const scope = {
    pipelineFingerprintSha256: sha256(options.pipelineFingerprintSha256),
    sourceFingerprintSha256: sha256(options.sourceFingerprintSha256),
  };
  const state = {
    issues: [],
    roleAnchors: [],
    teamAnchors: [],
    roleByTrajectory: new Map(),
    teamByTrajectory: new Map(),
    associationHashes: new Set(),
  };
  collectRoleAnchors(tracks, scope, state);
  collectTeamAnchors(tracks, scope, state);
  appendAnchorLimitIssues(state);
  return Object.freeze({
    roleAnchors: Object.freeze(state.roleAnchors.slice(0, 8).sort((left, right) => (
      left.role.localeCompare(right.role) || left.trajectoryId.localeCompare(right.trajectoryId)
    ))),
    teamAnchors: Object.freeze(state.teamAnchors.slice(0, 8).sort((left, right) => (
      left.teamSide.localeCompare(right.teamSide) || left.trajectoryId.localeCompare(right.trajectoryId)
    ))),
    associationArtifactSha256: state.associationHashes.size === 1 ? [...state.associationHashes][0] : "",
    playerCount: state.roleAnchors.filter((anchor) => anchor.role === "player").length,
    refereeCount: state.roleAnchors.filter((anchor) => anchor.role === "referee").length,
    homeCount: state.teamAnchors.filter((anchor) => anchor.teamSide === "home").length,
    awayCount: state.teamAnchors.filter((anchor) => anchor.teamSide === "away").length,
    issues: Object.freeze([...new Set(state.issues)]),
  });
}
