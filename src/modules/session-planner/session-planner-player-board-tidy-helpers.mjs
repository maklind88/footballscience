function defaultClamp(value, min, max) {
  const numericValue = Number(value);
  const low = Math.min(Number(min), Number(max));
  const high = Math.max(Number(min), Number(max));
  if (!Number.isFinite(numericValue)) {
    return low;
  }
  return Math.min(high, Math.max(low, numericValue));
}

export function createSessionPlannerPlayerBoardTidyHelpers(options = {}) {
  const clamp = typeof options.clamp === "function" ? options.clamp : defaultClamp;

  function getTidyLinePositions(values = [], minimumGap = 6, minBound = 4, maxBound = 96) {
    const normalizedValues = values.map((value) => clamp(Number(value) || 50, minBound, maxBound));
    if (normalizedValues.length <= 1) {
      return normalizedValues;
    }

    const availableSpan = Math.max(0, maxBound - minBound);
    const safeGap = Math.min(
      Math.max(Number(minimumGap) || 0, 0),
      availableSpan / Math.max(normalizedValues.length - 1, 1)
    );
    const requiredSpan = (normalizedValues.length - 1) * safeGap;
    const currentSpan = normalizedValues[normalizedValues.length - 1] - normalizedValues[0];

    if (currentSpan <= requiredSpan) {
      const center = normalizedValues.reduce((total, value) => total + value, 0) / normalizedValues.length;
      const left = clamp(center - requiredSpan / 2, minBound, maxBound - requiredSpan);
      return normalizedValues.map((_value, index) => clamp(left + index * safeGap, minBound, maxBound));
    }

    const nextValues = [...normalizedValues];
    for (let index = 1; index < nextValues.length; index += 1) {
      nextValues[index] = Math.max(nextValues[index], nextValues[index - 1] + safeGap);
    }

    const overflow = nextValues[nextValues.length - 1] - maxBound;
    if (overflow > 0) {
      for (let index = 0; index < nextValues.length; index += 1) {
        nextValues[index] -= overflow;
      }
    }

    for (let index = nextValues.length - 2; index >= 0; index -= 1) {
      nextValues[index] = Math.min(nextValues[index], nextValues[index + 1] - safeGap);
    }

    const underflow = minBound - nextValues[0];
    if (underflow > 0) {
      for (let index = 0; index < nextValues.length; index += 1) {
        nextValues[index] += underflow;
      }
    }

    return nextValues.map((value) => clamp(value, minBound, maxBound));
  }

  function getTidyRows(entries = [], minY = 6.5) {
    const rowThreshold = clamp(minY * 0.48, 2.8, 4.2);
    return [...entries]
      .sort((first, second) => first.y - second.y || first.x - second.x)
      .reduce((rows, entry) => {
        const previousRow = rows[rows.length - 1];
        if (previousRow && Math.abs(entry.y - previousRow.averageY) <= rowThreshold) {
          previousRow.entries.push(entry);
          previousRow.averageY =
            previousRow.entries.reduce((total, rowEntry) => total + rowEntry.y, 0) / previousRow.entries.length;
          return rows;
        }
        rows.push({ averageY: entry.y, entries: [entry] });
        return rows;
      }, []);
  }

  function relaxTidyEntries(movableEntries = [], fixedEntries = [], settings = {}) {
    const minX = Number(settings.minX) || 7.8;
    const minY = Number(settings.minY) || 6.7;
    const minBoundsX = Number(settings.minBoundsX) || 4;
    const maxBoundsX = Number(settings.maxBoundsX) || 96;
    const minBoundsY = Number(settings.minBoundsY) || 7;
    const maxBoundsY = Number(settings.maxBoundsY) || 93;
    const movableIds = new Set(movableEntries.map((entry) => entry.id));
    const entries = [...movableEntries, ...fixedEntries];

    for (let iteration = 0; iteration < 72; iteration += 1) {
      let moved = false;
      for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
          const first = entries[firstIndex];
          const second = entries[secondIndex];
          const firstMovable = movableIds.has(first.id);
          const secondMovable = movableIds.has(second.id);
          if (!firstMovable && !secondMovable) {
            continue;
          }

          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const overlapX = minX - Math.abs(dx);
          const overlapY = minY - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) {
            continue;
          }

          const separateOnX = Math.abs(dx) > 0.01 && (overlapX < overlapY || Math.abs(dy) <= 0.01);
          const direction = Math.sign(separateOnX ? dx : dy) || (first.order < second.order ? 1 : -1);
          const correction = ((separateOnX ? overlapX : overlapY) + 0.16) / (firstMovable && secondMovable ? 2 : 1);
          if (separateOnX) {
            if (firstMovable) first.x = clamp(first.x - direction * correction, minBoundsX, maxBoundsX);
            if (secondMovable) second.x = clamp(second.x + direction * correction, minBoundsX, maxBoundsX);
          } else {
            if (firstMovable) first.y = clamp(first.y - direction * correction, minBoundsY, maxBoundsY);
            if (secondMovable) second.y = clamp(second.y + direction * correction, minBoundsY, maxBoundsY);
          }
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }

    return movableEntries;
  }

  function getTidiedPlayerBoardPositions(selectedEntries = [], fixedEntries = [], settings = {}) {
    const minX = Number(settings.minX) || 7.8;
    const minY = Number(settings.minY) || 6.7;
    const minBoundsX = Number(settings.minBoundsX) || 4;
    const maxBoundsX = Number(settings.maxBoundsX) || 96;
    const minBoundsY = Number(settings.minBoundsY) || 7;
    const maxBoundsY = Number(settings.maxBoundsY) || 93;
    const rows = getTidyRows(selectedEntries, minY);
    const rowYValues = getTidyLinePositions(
      rows.map((row) => row.averageY),
      minY,
      minBoundsY,
      maxBoundsY
    );
    const arrangedEntries = [];

    rows.forEach((row, rowIndex) => {
      const sortedEntries = [...row.entries].sort((first, second) => first.x - second.x || first.order - second.order);
      const rowXValues = getTidyLinePositions(
        sortedEntries.map((entry) => entry.x),
        minX,
        minBoundsX,
        maxBoundsX
      );
      sortedEntries.forEach((entry, entryIndex) => {
        arrangedEntries.push({
          ...entry,
          x: rowXValues[entryIndex],
          y: rowYValues[rowIndex],
        });
      });
    });

    return relaxTidyEntries(arrangedEntries, fixedEntries, {
      minX,
      minY,
      minBoundsX,
      maxBoundsX,
      minBoundsY,
      maxBoundsY,
    });
  }

  return {
    getTidiedPlayerBoardPositions,
  };
}
