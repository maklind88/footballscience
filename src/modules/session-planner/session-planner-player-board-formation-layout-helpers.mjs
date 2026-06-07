function defaultClamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function defaultGetPlayerRoleProfile() {
  return { roleKey: "midfielder", roleOrder: 2, side: "center" };
}

export function createSessionPlannerPlayerBoardFormationLayoutHelpers(options = {}) {
  const maxTeamCount = Number.isFinite(Number(options.maxTeamCount)) ? Number(options.maxTeamCount) : 6;
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;
  const getPlayerRoleProfile =
    typeof options.getPlayerRoleProfile === "function" ? options.getPlayerRoleProfile : defaultGetPlayerRoleProfile;
  const getPositionGroup =
    typeof options.getPositionGroup === "function"
      ? options.getPositionGroup
      : () => ({ key: "midfielder", x: 58 });
  const getRoleOrder = typeof options.getRoleOrder === "function" ? options.getRoleOrder : (roleKey) => {
    const orderByRole = { goalkeeper: 0, defender: 1, midfielder: 2, forward: 3 };
    return orderByRole[roleKey] ?? 2;
  };

  function getDefaultGridPosition(index, total) {
    const playerTotal = Math.max(Number(total) || 1, 1);
    const columns =
      playerTotal > 30
        ? 6
        : playerTotal > 22
          ? 5
          : playerTotal > 12
            ? 4
            : playerTotal > 4
              ? 3
              : Math.max(playerTotal, 1);
    const rows = Math.max(Math.ceil(playerTotal / columns), 1);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = columns === 1 ? 50 : 10 + column * (80 / (columns - 1));
    const y = rows === 1 ? 50 : 12 + row * (76 / (rows - 1));
    return {
      x: clamp(x, 8, 92),
      y: clamp(y, 12, 88),
    };
  }

  function getDefaultPosition(item, index, boardPlayers = []) {
    const playerId = item?.player?.id ?? item?.id ?? "";
    if (!playerId || !Array.isArray(boardPlayers) || !boardPlayers.length) {
      return getDefaultGridPosition(index, boardPlayers?.length || 1);
    }
    const group = getPositionGroup(item.player);
    const groupPlayers = boardPlayers.filter((candidate) => getPositionGroup(candidate.player).key === group.key);
    const groupIndex = Math.max(groupPlayers.findIndex((candidate) => candidate.player.id === playerId), 0);
    const groupTotal = Math.max(groupPlayers.length, 1);
    const step = groupTotal > 7 ? 7.4 : groupTotal > 4 ? 9.2 : 12;
    const span = Math.min(60, (groupTotal - 1) * step);
    const y = groupTotal === 1 ? 50 : 50 - span / 2 + groupIndex * (span / (groupTotal - 1));
    return {
      x: group.x,
      y: clamp(y, 18, 84),
    };
  }

  function normalizeFormationValue(value) {
    return String(value ?? "")
      .replace(/[–—−]/g, "-")
      .replace(/[x×]/gi, "-")
      .replace(/[^0-9\-\s]/g, "")
      .replace(/\s+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function cleanFormationInput(value) {
    return String(value ?? "")
      .replace(/[–—−]/g, "-")
      .replace(/[x×]/gi, "-")
      .replace(/[^0-9\-\s]/g, "")
      .replace(/\s+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-/, "")
      .slice(0, 18);
  }

  function parseFormation(value) {
    const normalizedValue = normalizeFormationValue(value);
    if (!normalizedValue) {
      return [];
    }
    return normalizedValue
      .split("-")
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0 && item <= 11);
  }

  function normalizeTeamCount(value) {
    const numericValue = Math.round(Number(value));
    if (!Number.isFinite(numericValue)) {
      return 2;
    }
    return clamp(numericValue, 1, maxTeamCount);
  }

  function getFormationLineRole(lineIndex, lineTotal) {
    if (lineTotal <= 1) return "midfielder";
    if (lineIndex === 0) return "defender";
    if (lineIndex === lineTotal - 1) return "forward";
    return "midfielder";
  }

  function getFormationSide(slotIndex, lineCount) {
    if (lineCount <= 1) return "center";
    const ratio = slotIndex / (lineCount - 1);
    if (ratio <= 0.34) return "left";
    if (ratio >= 0.66) return "right";
    return "center";
  }

  function getFormationSideOrder(side) {
    const orderBySide = { left: 0, center: 0.5, right: 1 };
    return orderBySide[side] ?? 0.5;
  }

  function getFormationSlotX(slotIndex, lineCount) {
    if (lineCount <= 1) {
      return 50;
    }
    const spreadByCount = { 2: 8, 3: 16, 4: 24, 5: 31, 6: 37 };
    const spread = spreadByCount[lineCount] ?? Math.min(42, 12 + (lineCount - 2) * 5.5);
    const left = 50 - spread / 2;
    const right = 50 + spread / 2;
    return left + slotIndex * ((right - left) / (lineCount - 1));
  }

  function getFormationLineY(lineIndex, lineTotal, hasGoalkeeperSlot = false) {
    if (lineTotal <= 1) {
      return hasGoalkeeperSlot ? 52 : 50;
    }
    const top = hasGoalkeeperSlot ? 36 : 34;
    const bottom = hasGoalkeeperSlot ? 62 : 66;
    return bottom - lineIndex * ((bottom - top) / (lineTotal - 1));
  }

  function createFormationSlots(formation, hasGoalkeeperSlot = false) {
    const lineTotal = formation.length;
    const slots = [];
    if (hasGoalkeeperSlot) {
      slots.push({ roleKey: "goalkeeper", roleOrder: getRoleOrder("goalkeeper"), side: "center", x: 50, y: 80 });
    }
    formation.forEach((lineCount, lineIndex) => {
      const roleKey = getFormationLineRole(lineIndex, lineTotal);
      const y = getFormationLineY(lineIndex, lineTotal, hasGoalkeeperSlot);
      for (let slotIndex = 0; slotIndex < lineCount; slotIndex += 1) {
        const side = getFormationSide(slotIndex, lineCount);
        slots.push({
          roleKey,
          roleOrder: getRoleOrder(roleKey),
          side,
          x: clamp(getFormationSlotX(slotIndex, lineCount), 18, 82),
          y: clamp(y, 14, 88),
        });
      }
    });
    return slots;
  }

  function getAutoTeamGrid(teamCount) {
    const normalizedTeamCount = normalizeTeamCount(teamCount);
    const columns = normalizedTeamCount <= 3 ? normalizedTeamCount : Math.ceil(normalizedTeamCount / 2);
    const rows = Math.ceil(normalizedTeamCount / columns);
    return { columns, rows };
  }

  function getAutoTeamCell(teamIndex, teamCount) {
    const grid = getAutoTeamGrid(teamCount);
    const column = teamIndex % grid.columns;
    const row = Math.floor(teamIndex / grid.columns);
    const width = 100 / grid.columns;
    const height = 100 / grid.rows;
    return { left: column * width, top: row * height, width, height };
  }

  function mapSlotToAutoTeamCell(slot, cell) {
    const horizontalScale = cell.width < 34 ? 1.38 : 1.24;
    const verticalScale = cell.height < 58 ? 1.05 : 0.86;
    const x = cell.left + cell.width / 2 + (slot.x - 50) * (cell.width / 100) * horizontalScale;
    const y = cell.top + cell.height / 2 + (slot.y - 50) * (cell.height / 100) * verticalScale;
    return {
      ...slot,
      x: clamp(x, cell.left + 4, cell.left + cell.width - 4),
      y: clamp(y, cell.top + 8, cell.top + cell.height - 6),
    };
  }

  function createExtraTeamSlots(extraCount, cell) {
    if (!extraCount) {
      return [];
    }
    const columns = Math.min(extraCount, 4);
    const rows = Math.ceil(extraCount / columns);
    return Array.from({ length: extraCount }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = columns === 1 ? 50 : 50 - 18 + column * (36 / (columns - 1));
      const y = rows === 1 ? 86 : 82 + row * (10 / Math.max(rows - 1, 1));
      return mapSlotToAutoTeamCell(
        { roleKey: "midfielder", roleOrder: getRoleOrder("midfielder"), side: getFormationSide(column, columns), x, y },
        cell
      );
    });
  }

  function createAutoTeamFormationSlots(teamItems, formation, teamIndex, teamCount) {
    const outfieldSlotCount = formation.reduce((total, count) => total + count, 0);
    const hasGoalkeeper = teamItems.some((item) => getPlayerRoleProfile(item.player).roleKey === "goalkeeper");
    const hasGoalkeeperSlot = hasGoalkeeper && teamItems.length >= outfieldSlotCount + 1;
    const cell = getAutoTeamCell(teamIndex, teamCount);
    const formationSlots = createFormationSlots(formation, hasGoalkeeperSlot).map((slot) => mapSlotToAutoTeamCell(slot, cell));
    const extraSlots = createExtraTeamSlots(Math.max(0, teamItems.length - formationSlots.length), cell);
    return [...formationSlots, ...extraSlots];
  }

  return {
    cleanFormationInput,
    createAutoTeamFormationSlots,
    createExtraTeamSlots,
    createFormationSlots,
    getAutoTeamCell,
    getAutoTeamGrid,
    getDefaultGridPosition,
    getDefaultPosition,
    getFormationLineRole,
    getFormationLineY,
    getFormationSide,
    getFormationSideOrder,
    getFormationSlotX,
    mapSlotToAutoTeamCell,
    normalizeFormationValue,
    normalizeTeamCount,
    parseFormation,
  };
}
