/**
 * Mathematical utility functions for pose analysis
 */

import { LandmarkCoord } from '../models/PoseTypes';

/**
 * Calculate the Euclidean distance between two 3D points
 */
export function calculateDistance(pointA: LandmarkCoord, pointB: LandmarkCoord): number {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const dz = pointB.z - pointA.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate the angle at pointB formed by pointA-pointB-pointC
 * Returns angle in degrees (0-180)
 * 
 * Handles edge cases:
 * - Missing/null landmarks return null
 * - Clamps cosine between -1 and 1 to avoid NaN from acos
 */
export function calculateAngle(
  pointA: LandmarkCoord | null,
  pointB: LandmarkCoord | null,
  pointC: LandmarkCoord | null
): number | null {
  if (!pointA || !pointB || !pointC) {
    return null;
  }

  try {
    // Vector from B to A
    const BA = {
      x: pointA.x - pointB.x,
      y: pointA.y - pointB.y,
      z: pointA.z - pointB.z,
    };

    // Vector from B to C
    const BC = {
      x: pointC.x - pointB.x,
      y: pointC.y - pointB.y,
      z: pointC.z - pointB.z,
    };

    // Calculate magnitudes
    const magBA = Math.sqrt(BA.x * BA.x + BA.y * BA.y + BA.z * BA.z);
    const magBC = Math.sqrt(BC.x * BC.x + BC.y * BC.y + BC.z * BC.z);

    // Handle zero-length vectors
    if (magBA === 0 || magBC === 0) {
      return null;
    }

    // Calculate dot product
    const dotProduct = BA.x * BC.x + BA.y * BC.y + BA.z * BC.z;

    // Calculate cosine of angle
    let cosAngle = dotProduct / (magBA * magBC);

    // Clamp to [-1, 1] to avoid NaN from acos due to floating point errors
    cosAngle = Math.max(-1, Math.min(1, cosAngle));

    // Calculate angle in radians and convert to degrees
    const angleRadians = Math.acos(cosAngle);
    const angleDegrees = (angleRadians * 180) / Math.PI;

    return angleDegrees;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate the midpoint between two 3D points
 */
export function calculateMidpoint(pointA: LandmarkCoord, pointB: LandmarkCoord): LandmarkCoord {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
    z: (pointA.z + pointB.z) / 2,
  };
}

/**
 * Calculate average visibility/confidence from multiple values
 */
export function calculateAverageVisibility(visibilities: (number | null)[]): number {
  const validVisibilities = visibilities.filter((v) => v !== null && v !== undefined) as number[];
  if (validVisibilities.length === 0) {
    return 0;
  }
  const sum = validVisibilities.reduce((a, b) => a + b, 0);
  return sum / validVisibilities.length;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
