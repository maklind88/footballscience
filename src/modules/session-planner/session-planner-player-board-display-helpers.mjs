function defaultNormalizeColor(value = "", fallback = "") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function createSessionPlannerPlayerBoardDisplayHelpers(options = {}) {
  const getSelectedSession = typeof options.getSelectedSession === "function" ? options.getSelectedSession : () => null;
  const normalizeColor = typeof options.normalizeColor === "function" ? options.normalizeColor : defaultNormalizeColor;

  function getTone(participation) {
    if (participation <= 10) return "low";
    if (participation <= 25) return "rehab";
    if (participation <= 50) return "controlled";
    if (participation < 100) return "modified";
    return "full";
  }

  function getCustomColor(block, playerId) {
    if (!block?.playerBoardColors || typeof block.playerBoardColors !== "object") {
      return "";
    }
    return normalizeColor(block.playerBoardColors[playerId], "");
  }

  function getTextColor(backgroundColor) {
    const color = normalizeColor(backgroundColor, "");
    const match = color.match(/^#([0-9a-f]{6})$/i);
    if (!match) {
      return "#1d1d1f";
    }
    const value = match[1];
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luminance > 0.62 ? "#1d1d1f" : "#ffffff";
  }

  function getColorStyle(color) {
    const normalizedColor = normalizeColor(color, "");
    if (!normalizedColor) {
      return "";
    }
    return `--session-player-board-color: ${normalizedColor}; --session-player-board-text: ${getTextColor(normalizedColor)};`;
  }

  function getDataObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function hasTeamData(block = {}) {
    const colors = getDataObject(block.playerBoardColors);
    const positions = getDataObject(block.playerBoardPositions);
    return Boolean(Object.keys(colors).length || Object.keys(positions).length);
  }

  function getSourceBlocks(targetBlock = null) {
    const session = getSelectedSession();
    const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block?.id && block.id !== targetBlock?.id && hasTeamData(block));
  }

  function getSourceLabel(block, index) {
    const title = String(block?.title || block?.label || "Exercise").trim();
    return `Block ${index + 1}: ${title}`;
  }

  return {
    getColorStyle,
    getCustomColor,
    getDataObject,
    getSourceBlocks,
    getSourceLabel,
    getTextColor,
    getTone,
    hasTeamData,
  };
}
