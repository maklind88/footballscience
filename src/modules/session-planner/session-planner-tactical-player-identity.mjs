const playerTypes = new Set(["blue-player", "red-player", "neutral-player"]);
export const isTacticalRosterPlayer = (element) => playerTypes.has(element?.type);
const text = (value, length) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, length);

export function normalizeTacticalPlayerPhoto(value) {
  const raw = text(value, 2048);
  if (!raw || String(value).length > 2048) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeTacticalPlayerIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const squadPlayerId = text(value.squadPlayerId, 160);
  const name = text(value.name, 100);
  if (!squadPlayerId || !name) return null;
  return {
    squadPlayerId,
    name,
    initials: text(value.initials, 6).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "") || "?",
    number: text(value.number, 2).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    photoUrl: normalizeTacticalPlayerPhoto(value.photoUrl),
  };
}

export function getTacticalPlayerIdentityFields(element) {
  const playerIdentity = isTacticalRosterPlayer(element) && normalizeTacticalPlayerIdentity(element.playerIdentity);
  if (!playerIdentity) return {};
  return { playerIdentity, playerDisplay: ["number", "initials", "photo"].includes(element.playerDisplay)
    ? element.playerDisplay : "initials" };
}

export function getTacticalPlayerDisplay(element) {
  const { playerIdentity, playerDisplay } = getTacticalPlayerIdentityFields(element);
  const number = text(element?.playerNumber, 2).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return {
    label: playerIdentity && playerDisplay !== "number" ? playerIdentity.initials
      : number || playerIdentity?.number || playerIdentity?.initials || "",
    name: playerIdentity?.name || "",
    photoUrl: playerDisplay === "photo" ? playerIdentity?.photoUrl || "" : "",
    linked: Boolean(playerIdentity),
  };
}

// Update identity, not geometry. Missing markers in a frame are never recreated.
export function updateTacticalPlayerIdentity(block, ids, patch, { allFrames = true } = {}) {
  const selected = new Set(ids);
  const layers = [block?.tacticalElements, ...(allFrames ? (block?.tacticalFrames || []).map((frame) => frame.elements) : [])];
  let changed = false;
  const seen = new Set();
  for (const layer of layers) {
    for (const element of Array.isArray(layer) ? layer : []) {
      if (!selected.has(element.id) || !isTacticalRosterPlayer(element) || seen.has(element)) continue;
      seen.add(element);
      const before = JSON.stringify([element.playerIdentity, element.playerDisplay, element.playerNumber]);
      if (Object.hasOwn(patch, "playerIdentity")) {
        const identity = normalizeTacticalPlayerIdentity(patch.playerIdentity);
        if (identity) {
          element.playerIdentity = identity;
          element.playerDisplay = "initials";
          element.playerNumber = identity.number || null;
        } else {
          delete element.playerIdentity;
          delete element.playerDisplay;
        }
      }
      if (element.playerIdentity && ["number", "initials", "photo"].includes(patch.playerDisplay)) {
        element.playerDisplay = patch.playerDisplay;
      }
      if (Object.hasOwn(patch, "playerNumber")) element.playerNumber = patch.playerNumber;
      changed ||= before !== JSON.stringify([element.playerIdentity, element.playerDisplay, element.playerNumber]);
    }
  }
  return changed;
}
