function finiteWeight(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function squareWeights(values = [], minimumWeight = 0) {
  const rowCount = values.length;
  const columnCount = values.reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0);
  const size = Math.max(rowCount, columnCount);
  const matrix = Array.from({ length: size }, (_, rowIndex) => (
    Array.from({ length: size }, (_, columnIndex) => {
      const weight = finiteWeight(values[rowIndex]?.[columnIndex]);
      return weight >= minimumWeight ? weight : 0;
    })
  ));
  return { matrix, rowCount, columnCount, size };
}

// Hungarian assignment keeps dense football scenes deterministic and globally optimal.
export function maximumWeightAssignment(values = [], minimumWeight = 0) {
  const { matrix, rowCount, columnCount, size } = squareWeights(values, minimumWeight);
  if (!rowCount || !columnCount) return [];
  const maximum = matrix.reduce(
    (outer, row) => Math.max(outer, ...row),
    0,
  );
  const potentialRows = Array(size + 1).fill(0);
  const potentialColumns = Array(size + 1).fill(0);
  const matchedRow = Array(size + 1).fill(0);
  const previousColumn = Array(size + 1).fill(0);

  for (let row = 1; row <= size; row += 1) {
    matchedRow[0] = row;
    let column = 0;
    const minimumCost = Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(size + 1).fill(false);
    do {
      used[column] = true;
      const currentRow = matchedRow[column];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate += 1) {
        if (used[candidate]) continue;
        const cost = maximum - matrix[currentRow - 1][candidate - 1]
          - potentialRows[currentRow] - potentialColumns[candidate];
        if (cost < minimumCost[candidate]) {
          minimumCost[candidate] = cost;
          previousColumn[candidate] = column;
        }
        if (minimumCost[candidate] < delta) {
          delta = minimumCost[candidate];
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate += 1) {
        if (used[candidate]) {
          potentialRows[matchedRow[candidate]] += delta;
          potentialColumns[candidate] -= delta;
        } else {
          minimumCost[candidate] -= delta;
        }
      }
      column = nextColumn;
    } while (matchedRow[column] !== 0);

    do {
      const previous = previousColumn[column];
      matchedRow[column] = matchedRow[previous];
      column = previous;
    } while (column !== 0);
  }

  const pairs = [];
  for (let column = 1; column <= size; column += 1) {
    const row = matchedRow[column] - 1;
    const columnIndex = column - 1;
    const weight = matrix[row]?.[columnIndex] || 0;
    if (row >= 0 && row < rowCount && columnIndex < columnCount && weight >= minimumWeight && weight > 0) {
      pairs.push({ rowIndex: row, columnIndex, weight });
    }
  }
  return pairs.sort((first, second) => first.rowIndex - second.rowIndex);
}

export function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function harmonicMean(first, second) {
  if (first === null || second === null) return null;
  return first + second > 0 ? (2 * first * second) / (first + second) : 0;
}

export function globalIdentityMetrics(pairCounts = new Map(), truthCount = 0, predictionCount = 0) {
  const truthIds = [...pairCounts.keys()];
  const predictionIds = [...new Set(
    [...pairCounts.values()].flatMap((counts) => [...counts.keys()]),
  )];
  const matrix = truthIds.map((truthId) => predictionIds.map(
    (predictionId) => pairCounts.get(truthId)?.get(predictionId) || 0,
  ));
  const identityTruePositives = maximumWeightAssignment(matrix, 1)
    .reduce((total, pair) => total + pair.weight, 0);
  const identityFalseNegatives = Math.max(0, truthCount - identityTruePositives);
  const identityFalsePositives = Math.max(0, predictionCount - identityTruePositives);
  const identityPrecision = safeRatio(identityTruePositives, predictionCount) ?? 0;
  const identityRecall = safeRatio(identityTruePositives, truthCount) ?? 0;
  return {
    identityTruePositives,
    identityFalsePositives,
    identityFalseNegatives,
    identityPrecision,
    identityRecall,
    identityF1: harmonicMean(identityPrecision, identityRecall),
  };
}
