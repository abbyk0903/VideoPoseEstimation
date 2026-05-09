/**
 * Statistical utility functions for movement analysis
 */

/**
 * Calculate the average of an array of numbers, ignoring null/undefined values
 */
export function calculateAverage(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter((v) => v !== null && v !== undefined) as number[];
  if (validValues.length === 0) return null;
  return validValues.reduce((a, b) => a + b, 0) / validValues.length;
}

/**
 * Find the minimum value in an array, ignoring null/undefined values
 */
export function findMin(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter((v) => v !== null && v !== undefined) as number[];
  if (validValues.length === 0) return null;
  return Math.min(...validValues);
}

/**
 * Find the maximum value in an array, ignoring null/undefined values
 */
export function findMax(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter((v) => v !== null && v !== undefined) as number[];
  if (validValues.length === 0) return null;
  return Math.max(...validValues);
}

/**
 * Calculate range (max - min) of an array of numbers
 */
export function calculateRange(values: (number | null | undefined)[]): number | null {
  const min = findMin(values);
  const max = findMax(values);
  if (min === null || max === null) return null;
  return max - min;
}

/**
 * Calculate standard deviation of an array of numbers
 */
export function calculateStandardDeviation(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter((v) => v !== null && v !== undefined) as number[];
  if (validValues.length < 2) return null;

  const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const squaredDifferences = validValues.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDifferences.reduce((a, b) => a + b, 0) / (validValues.length - 1);
  return Math.sqrt(variance);
}

/**
 * Count valid (non-null, non-undefined) values in an array
 */
export function countValidValues(values: (any)[]): number {
  return values.filter((v) => v !== null && v !== undefined).length;
}

/**
 * Count missing (null or undefined) values in an array
 */
export function countMissingValues(values: (any)[]): number {
  return values.length - countValidValues(values);
}

/**
 * Calculate the percentage of missing values
 */
export function calculateMissingPercentage(values: (any)[]): number {
  if (values.length === 0) return 0;
  return (countMissingValues(values) / values.length) * 100;
}

/**
 * Simple moving average smoothing
 */
export function applyMovingAverage(
  values: (number | null)[],
  windowSize: number = 3
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.floor(windowSize / 2) + 1);
    const window = values.slice(start, end);

    const avg = calculateAverage(window);
    result.push(avg);
  }

  return result;
}

/**
 * Detect peaks in a smoothed timeline
 * Returns indices of peaks
 */
export function detectPeaks(values: (number | null)[], minProminence: number = 5): number[] {
  const peaks: number[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    const next = values[i + 1];

    if (prev === null || curr === null || next === null) continue;

    // Local maximum
    if (curr > prev && curr > next) {
      const prominence = Math.min(curr - prev, curr - next);
      if (prominence >= minProminence) {
        peaks.push(i);
      }
    }
  }

  return peaks;
}

/**
 * Detect valleys in a smoothed timeline
 * Returns indices of valleys
 */
export function detectValleys(values: (number | null)[], minProminence: number = 5): number[] {
  const valleys: number[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    const next = values[i + 1];

    if (prev === null || curr === null || next === null) continue;

    // Local minimum
    if (curr < prev && curr < next) {
      const prominence = Math.min(prev - curr, next - curr);
      if (prominence >= minProminence) {
        valleys.push(i);
      }
    }
  }

  return valleys;
}

/**
 * Estimate repetitions from peaks and valleys
 * A complete repetition = peak → valley → peak (or valley → peak → valley)
 */
export function estimateRepetitionsFromExtrema(
  peaks: number[],
  valleys: number[]
): {
  estimatedReps: number;
  confidence: number;
} {
  if (peaks.length === 0 && valleys.length === 0) {
    return { estimatedReps: 0, confidence: 0 };
  }

  // Combine all extrema and sort by index
  const allExtrema = [
    ...peaks.map((i) => ({ index: i, type: 'peak' as const })),
    ...valleys.map((i) => ({ index: i, type: 'valley' as const })),
  ].sort((a, b) => a.index - b.index);

  // Count transitions between peak and valley (or vice versa)
  let transitions = 0;
  for (let i = 1; i < allExtrema.length; i++) {
    if (allExtrema[i].type !== allExtrema[i - 1].type) {
      transitions++;
    }
  }

  // Each full repetition requires 2 transitions (up→down or down→up)
  const estimatedReps = Math.floor(transitions / 2);

  // Confidence: higher if we have clear peaks and valleys
  const extremaCount = allExtrema.length;
  const confidence =
    extremaCount >= 4 ? Math.min(1, extremaCount / 8) : extremaCount / 4;

  return { estimatedReps, confidence };
}

/**
 * Calculate the absolute difference between two values, handling nulls
 */
export function calculateDifference(val1: number | null, val2: number | null): number | null {
  if (val1 === null || val2 === null) return null;
  return Math.abs(val1 - val2);
}

/**
 * Calculate average absolute difference between parallel arrays
 */
export function calculateSymmetryDifference(
  leftValues: (number | null)[],
  rightValues: (number | null)[]
): number | null {
  if (leftValues.length !== rightValues.length) {
    return null;
  }

  const differences: number[] = [];

  for (let i = 0; i < leftValues.length; i++) {
    const diff = calculateDifference(leftValues[i], rightValues[i]);
    if (diff !== null) {
      differences.push(diff);
    }
  }

  if (differences.length === 0) return null;
  return differences.reduce((a, b) => a + b, 0) / differences.length;
}

/**
 * Convert a difference score to a symmetry score (0-1)
 * 0 = very different, 1 = very similar
 * Uses a normalized formula: 1 / (1 + normalizedDifference)
 */
export function differenceToSymmetryScore(
  differenceAvg: number | null,
  maxExpectedDifference: number = 30
): number | null {
  if (differenceAvg === null) return null;
  // Normalize difference relative to expected range
  const normalized = differenceAvg / maxExpectedDifference;
  // Convert to symmetry score: high difference = low score
  return 1 / (1 + normalized);
}

/**
 * Calculate overall symmetry score from individual component scores
 */
export function calculateOverallSymmetryScore(
  scores: (number | null)[]
): number | null {
  const validScores = scores.filter((s) => s !== null) as number[];
  if (validScores.length === 0) return null;
  return validScores.reduce((a, b) => a + b, 0) / validScores.length;
}

/**
 * Calculate consistency score from angle variability
 * Lower variability = higher consistency (smoother movement)
 * Returns a score from 0-1 where 1 = perfect consistency
 */
export function calculateConsistencyScore(
  standardDeviations: (number | null)[]
): number | null {
  const validStdDevs = standardDeviations.filter((s) => s !== null) as number[];
  if (validStdDevs.length === 0) return null;

  // Average standard deviation across all angles
  const avgStdDev = validStdDevs.reduce((a, b) => a + b, 0) / validStdDevs.length;

  // Convert to consistency score: lower stddev = higher consistency
  // Using exponential decay so high variability approaches 0
  const consistencyScore = Math.exp(-avgStdDev / 30);

  return Math.min(1, consistencyScore);
}

/**
 * Calculate average variability across angles
 */
export function calculateAverageVariability(
  standardDeviations: (number | null)[]
): number | null {
  return calculateAverage(standardDeviations);
}
