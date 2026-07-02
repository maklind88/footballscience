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

  function getAverage(values = []) {
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) {
      return 50;
    }
    return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  }

  function getRange(values = []) {
    const numbers = values.map(Number).filter(Number.isFinite).sort((first, second) => first - second);
    if (!numbers.length) {
      return { min: 50, max: 50, spread: 0, values: [] };
    }
    return {
      min: numbers[0],
      max: numbers[numbers.length - 1],
      spread: numbers[numbers.length - 1] - numbers[0],
      values: numbers,
    };
  }

  function getSafeGap(count, requestedGap, minBound, maxBound) {
    const availableSpan = Math.max(0, maxBound - minBound);
    return Math.min(Math.max(Number(requestedGap) || 0, 0), availableSpan / Math.max(count - 1, 1));
  }

  function getCenteredLinePositions(count, center, requestedGap, minBound, maxBound, preferredSpan = 0) {
    if (count <= 1) {
      return [clamp(center, minBound, maxBound)];
    }
    const safeGap = getSafeGap(count, requestedGap, minBound, maxBound);
    const availableSpan = Math.max(0, maxBound - minBound);
    const span = Math.min(Math.max(Number(preferredSpan) || 0, (count - 1) * safeGap), availableSpan);
    const actualGap = span / Math.max(count - 1, 1);
    const left = clamp(center - span / 2, minBound, maxBound - span);
    return Array.from({ length: count }, (_item, index) => clamp(left + index * actualGap, minBound, maxBound));
  }

  function getSymmetricLinePositions(values = [], requestedGap = 6, minBound = 4, maxBound = 96) {
    const range = getRange(values.map((value) => clamp(Number(value) || 50, minBound, maxBound)));
    if (range.values.length <= 1) {
      return range.values;
    }
    return getCenteredLinePositions(
      range.values.length,
      getAverage(range.values),
      requestedGap,
      minBound,
      maxBound,
      range.spread
    );
  }

  function getAxisClusters(entries = [], axis = "x", threshold = 4) {
    const clusters = [];
    [...entries]
      .sort((first, second) => first[axis] - second[axis] || first.order - second.order)
      .forEach((entry) => {
        const previousCluster = clusters[clusters.length - 1];
        if (previousCluster && Math.abs(entry[axis] - previousCluster.average) <= threshold) {
          previousCluster.entries.push(entry);
          previousCluster.average = getAverage(previousCluster.entries.map((item) => item[axis]));
          return;
        }
        clusters.push({ average: entry[axis], entries: [entry] });
      });
    return clusters;
  }

  function getEntryClusterIndexes(clusters = []) {
    const indexes = new Map();
    clusters.forEach((cluster, clusterIndex) => {
      cluster.entries.forEach((entry) => {
        indexes.set(entry.id, clusterIndex);
      });
    });
    return indexes;
  }

  function getDuplicateCellOffset(index, total, minX, minY) {
    if (total <= 1) {
      return { x: 0, y: 0 };
    }
    const columns = Math.min(total, 2);
    const rows = Math.ceil(total / columns);
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: columns === 1 ? 0 : (column - (columns - 1) / 2) * minX * 0.58,
      y: rows === 1 ? 0 : (row - (rows - 1) / 2) * minY * 0.58,
    };
  }

  function getClusterGridPositions(entries, xClusters, yClusters, settings) {
    const {
      minX,
      minY,
      minBoundsX,
      maxBoundsX,
      minBoundsY,
      maxBoundsY,
    } = settings;
    const xIndexes = getEntryClusterIndexes(xClusters);
    const yIndexes = getEntryClusterIndexes(yClusters);
    const xPositions = getSymmetricLinePositions(
      xClusters.map((cluster) => cluster.average),
      minX,
      minBoundsX,
      maxBoundsX
    );
    const yPositions = getSymmetricLinePositions(
      yClusters.map((cluster) => cluster.average),
      minY,
      minBoundsY,
      maxBoundsY
    );
    const cellCounts = new Map();
    entries.forEach((entry) => {
      const key = `${xIndexes.get(entry.id) ?? 0}:${yIndexes.get(entry.id) ?? 0}`;
      cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
    });
    const cellIndexes = new Map();
    return entries.map((entry) => {
      const xIndex = xIndexes.get(entry.id) ?? 0;
      const yIndex = yIndexes.get(entry.id) ?? 0;
      const key = `${xIndex}:${yIndex}`;
      const cellIndex = cellIndexes.get(key) || 0;
      cellIndexes.set(key, cellIndex + 1);
      const offset = getDuplicateCellOffset(cellIndex, cellCounts.get(key), minX, minY);
      return {
        ...entry,
        x: clamp((xPositions[xIndex] ?? entry.x) + offset.x, minBoundsX, maxBoundsX),
        y: clamp((yPositions[yIndex] ?? entry.y) + offset.y, minBoundsY, maxBoundsY),
      };
    });
  }

  function getLinePositions(entries, axis, settings, ranges) {
    const {
      minX,
      minY,
      minBoundsX,
      maxBoundsX,
      minBoundsY,
      maxBoundsY,
    } = settings;
    const centerX = getAverage(entries.map((entry) => entry.x));
    const centerY = getAverage(entries.map((entry) => entry.y));
    const sortedEntries = [...entries].sort((first, second) =>
      axis === "x" ? first.x - second.x || first.order - second.order : first.y - second.y || first.order - second.order
    );

    if (axis === "x") {
      const xPositions = getCenteredLinePositions(
        sortedEntries.length,
        centerX,
        minX,
        minBoundsX,
        maxBoundsX,
        ranges.x.spread
      );
      return sortedEntries.map((entry, index) => ({
        ...entry,
        x: xPositions[index],
        y: clamp(centerY, minBoundsY, maxBoundsY),
      }));
    }

    const yPositions = getCenteredLinePositions(
      sortedEntries.length,
      centerY,
      minY,
      minBoundsY,
      maxBoundsY,
      ranges.y.spread
    );
    return sortedEntries.map((entry, index) => ({
      ...entry,
      x: clamp(centerX, minBoundsX, maxBoundsX),
      y: yPositions[index],
    }));
  }

  function getCompactGridPositions(entries, settings, ranges) {
    const {
      minX,
      minY,
      minBoundsX,
      maxBoundsX,
      minBoundsY,
      maxBoundsY,
    } = settings;
    const count = entries.length;
    const centerX = getAverage(entries.map((entry) => entry.x));
    const centerY = getAverage(entries.map((entry) => entry.y));
    const aspect = clamp((ranges.x.spread + minX) / Math.max(ranges.y.spread + minY, 1), 0.55, 1.8);
    let columns = Math.ceil(Math.sqrt(count * aspect));
    if (ranges.y.spread > ranges.x.spread * 1.35) {
      columns = Math.max(1, Math.floor(Math.sqrt(count)));
    } else if (ranges.x.spread > ranges.y.spread * 1.35) {
      columns = Math.min(count, Math.ceil(Math.sqrt(count) * 1.25));
    }
    columns = Math.max(1, Math.min(count, columns));
    const rows = Math.ceil(count / columns);
    const xPositions = getCenteredLinePositions(columns, centerX, minX, minBoundsX, maxBoundsX);
    const yPositions = getCenteredLinePositions(rows, centerY, minY, minBoundsY, maxBoundsY);
    return [...entries]
      .sort((first, second) => first.y - second.y || first.x - second.x || first.order - second.order)
      .map((entry, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return {
          ...entry,
          x: xPositions[column] ?? entry.x,
          y: yPositions[row] ?? entry.y,
        };
      });
  }

  function getStructuredTidyEntries(entries, settings) {
    const ranges = {
      x: getRange(entries.map((entry) => entry.x)),
      y: getRange(entries.map((entry) => entry.y)),
    };
    const xClusters = getAxisClusters(entries, "x", settings.minX * 0.64);
    const yClusters = getAxisClusters(entries, "y", settings.minY * 0.64);
    const hasGridStructure = entries.length >= 4 && xClusters.length >= 2 && yClusters.length >= 2;
    if (hasGridStructure) {
      return getClusterGridPositions(entries, xClusters, yClusters, settings);
    }
    if (ranges.y.spread <= settings.minY * 0.72 || ranges.x.spread >= ranges.y.spread * 1.55) {
      return getLinePositions(entries, "x", settings, ranges);
    }
    if (ranges.x.spread <= settings.minX * 0.72 || ranges.y.spread >= ranges.x.spread * 1.55) {
      return getLinePositions(entries, "y", settings, ranges);
    }
    return getCompactGridPositions(entries, settings, ranges);
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
    const arrangedEntries = getStructuredTidyEntries(selectedEntries, {
      minX,
      minY,
      minBoundsX,
      maxBoundsX,
      minBoundsY,
      maxBoundsY,
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
