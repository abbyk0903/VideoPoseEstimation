/**
 * MovementSummaryService - Summarize frame-by-frame pose data into compact metrics
 */

import {
  PoseAnalysisResponse,
  MovementSummaryResult,
  AngleSummaryStats,
  AngleName,
  SymmetryMetrics,
  MovementConsistency,
  DataReliability,
  RepetitionMetrics,
} from '../models/PoseTypes';
import {
  calculateAverage,
  findMin,
  findMax,
  calculateRange,
  calculateStandardDeviation,
  countValidValues,
  countMissingValues,
  applyMovingAverage,
  detectPeaks,
  detectValleys,
  estimateRepetitionsFromExtrema,
  calculateSymmetryDifference,
  differenceToSymmetryScore,
  calculateOverallSymmetryScore,
  calculateConsistencyScore,
  calculateAverageVariability,
  calculateMissingPercentage,
} from '../utils/stats';

const ANGLES_TO_TRACK: AngleName[] = [
  'leftKnee',
  'rightKnee',
  'leftHip',
  'rightHip',
  'leftElbow',
  'rightElbow',
  'leftShoulder',
  'rightShoulder',
  'torsoLean',
];

export class MovementSummaryService {
  /**
   * Generate a movement summary from a pose analysis result
   */
  static summarize(
    poseAnalysis: PoseAnalysisResponse,
    exerciseType: string | null = null
  ): MovementSummaryResult {
    // Extract angle timelines
    const angleTimelines = this.extractAngleTimelines(poseAnalysis.frames);
    const angleConfidenceTimelines = this.extractAngleConfidenceTimelines(poseAnalysis.frames);

    // Summarize each angle
    const angleSummary = this.summarizeAngles(angleTimelines, angleConfidenceTimelines);

    // Calculate symmetry metrics
    const symmetry = this.calculateSymmetry(angleTimelines);

    // Calculate movement consistency
    const movementConsistency = this.calculateMovementConsistency(angleSummary);

    // Calculate data reliability
    const dataReliability = this.calculateDataReliability(
      poseAnalysis.frames,
      angleTimelines
    );

    // Estimate repetitions
    const repMetrics = this.estimateRepetitions(angleTimelines);

    return {
      exerciseType,
      repMetrics,
      angleSummary,
      symmetry,
      movementConsistency,
      dataReliability,
    };
  }

  /**
   * Extract angle value timelines from frames
   */
  private static extractAngleTimelines(frames: any[]): Record<AngleName, (number | null)[]> {
    const timelines: Record<AngleName, (number | null)[]> = {} as any;

    ANGLES_TO_TRACK.forEach((angleName) => {
      timelines[angleName] = frames.map((frame) => {
        const angle = frame.angles?.[angleName];
        return angle?.value ?? null;
      });
    });

    return timelines;
  }

  /**
   * Extract angle confidence timelines from frames
   */
  private static extractAngleConfidenceTimelines(
    frames: any[]
  ): Record<AngleName, (number | null)[]> {
    const timelines: Record<AngleName, (number | null)[]> = {} as any;

    ANGLES_TO_TRACK.forEach((angleName) => {
      timelines[angleName] = frames.map((frame) => {
        const angle = frame.angles?.[angleName];
        return angle?.confidence ?? null;
      });
    });

    return timelines;
  }

  /**
   * Summarize each angle timeline into statistics
   */
  private static summarizeAngles(
    angleTimelines: Record<AngleName, (number | null)[]>,
    angleConfidenceTimelines: Record<AngleName, (number | null)[]>
  ): Partial<Record<AngleName, AngleSummaryStats>> {
    const summary: Partial<Record<AngleName, AngleSummaryStats>> = {};

    ANGLES_TO_TRACK.forEach((angleName) => {
      const timeline = angleTimelines[angleName];
      const confidenceTimeline = angleConfidenceTimelines[angleName];
      const validFrameCount = countValidValues(timeline);
      const missingFrameCount = countMissingValues(timeline);

      summary[angleName] = {
        avg: calculateAverage(timeline),
        min: findMin(timeline),
        max: findMax(timeline),
        range: calculateRange(timeline),
        standardDeviation: calculateStandardDeviation(timeline),
        validFrameCount,
        missingFrameCount,
        confidenceAvg: calculateAverage(confidenceTimeline),
      };
    });

    return summary;
  }

  /**
   * Calculate average confidence from angle timeline
   */
  private static calculateConfidenceAvg(timeline: (number | null)[]): number | null {
    return calculateAverage(timeline);
  }

  /**
   * Calculate symmetry metrics between left/right body parts
   */
  private static calculateSymmetry(
    angleTimelines: Record<AngleName, (number | null)[]>
  ): SymmetryMetrics {
    // Calculate average absolute differences between left/right angles
    const kneeDifferenceAvg = calculateSymmetryDifference(
      angleTimelines.leftKnee,
      angleTimelines.rightKnee
    );

    const hipDifferenceAvg = calculateSymmetryDifference(
      angleTimelines.leftHip,
      angleTimelines.rightHip
    );

    const elbowDifferenceAvg = calculateSymmetryDifference(
      angleTimelines.leftElbow,
      angleTimelines.rightElbow
    );

    const shoulderDifferenceAvg = calculateSymmetryDifference(
      angleTimelines.leftShoulder,
      angleTimelines.rightShoulder
    );

    // Convert differences to symmetry scores (0-1 scale)
    const kneeSymmetry = differenceToSymmetryScore(kneeDifferenceAvg);
    const hipSymmetry = differenceToSymmetryScore(hipDifferenceAvg);
    const elbowSymmetry = differenceToSymmetryScore(elbowDifferenceAvg);
    const shoulderSymmetry = differenceToSymmetryScore(shoulderDifferenceAvg);

    // Overall symmetry is average of individual component symmetries
    const overallSymmetryScore = calculateOverallSymmetryScore([
      kneeSymmetry,
      hipSymmetry,
      elbowSymmetry,
      shoulderSymmetry,
    ]);

    return {
      kneeDifferenceAvg,
      hipDifferenceAvg,
      elbowDifferenceAvg,
      shoulderDifferenceAvg,
      overallSymmetryScore,
    };
  }

  /**
   * Calculate movement consistency metrics
   */
  private static calculateMovementConsistency(
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>
  ): MovementConsistency {
    // Collect all standard deviations
    const standardDeviations: (number | null)[] = ANGLES_TO_TRACK.map(
      (angleName) => angleSummary[angleName]?.standardDeviation ?? null
    );

    const overallConsistencyScore = calculateConsistencyScore(standardDeviations);
    const averageAngleVariability = calculateAverageVariability(standardDeviations);
    const torsoLeanStandardDeviation = angleSummary.torsoLean?.standardDeviation ?? null;

    return {
      overallConsistencyScore,
      averageAngleVariability,
      torsoLeanStandardDeviation,
    };
  }

  /**
   * Calculate data reliability metrics
   */
  private static calculateDataReliability(
    frames: any[],
    angleTimelines: Record<AngleName, (number | null)[]>
  ): DataReliability {
    // Average landmark confidence across all frames
    const landmarkConfidences = frames
      .map((f) => f.landmarks)
      .map((landmarks) => {
        const visibilities = Object.values(landmarks)
          .filter((l) => l)
          .map((l) => (l as any).visibility);
        return calculateAverage(visibilities);
      });

    const averageLandmarkConfidence = calculateAverage(landmarkConfidences);

    // Count low confidence frames
    const lowConfidenceFrameCount = frames.filter((f) => {
      const visibilities = Object.values(f.landmarks || {})
        .filter((l) => l)
        .map((l) => (l as any).visibility);
      const avg = calculateAverage(visibilities);
      return avg && avg < 0.5;
    }).length;

    const lowConfidenceFramePercentage =
      frames.length > 0 ? (lowConfidenceFrameCount / frames.length) * 100 : 0;

    // Calculate missing angle percentage
    const allAngleValues = Object.values(angleTimelines).flat();
    const missingAnglePercentage = calculateMissingPercentage(allAngleValues);

    return {
      averageLandmarkConfidence,
      lowConfidenceFramePercentage: Number(lowConfidenceFramePercentage.toFixed(1)),
      missingAnglePercentage: Number(missingAnglePercentage.toFixed(1)),
      sampledFrameCount: frames.length,
    };
  }

  /**
   * Estimate repetitions from angle timelines
   * Generic approach without exercise-specific logic
   */
  private static estimateRepetitions(
    angleTimelines: Record<AngleName, (number | null)[]>
  ): RepetitionMetrics {
    // Find the angle with the largest range of motion
    let bestAngleName: AngleName | null = null;
    let largestRange = 0;

    ANGLES_TO_TRACK.forEach((angleName) => {
      const timeline = angleTimelines[angleName];

      // Skip if too many missing values
      const validCount = countValidValues(timeline);
      if (validCount < timeline.length * 0.5) {
        return;
      }

      const range = calculateRange(timeline);
      if (range !== null && range > largestRange) {
        largestRange = range;
        bestAngleName = angleName;
      }
    });

    if (!bestAngleName) {
      return {
        estimatedRepCount: null,
        repConfidence: 0,
        mainMovementAngleUsed: null,
      };
    }

    // Use the best angle timeline for rep estimation
    const timeline = angleTimelines[bestAngleName];

    // Apply smoothing to reduce noise
    const smoothed = applyMovingAverage(timeline, 5);

    // Detect peaks and valleys
    const peaks = detectPeaks(smoothed, 5);
    const valleys = detectValleys(smoothed, 5);

    // Estimate reps from extrema
    const { estimatedReps, confidence } = estimateRepetitionsFromExtrema(peaks, valleys);

    return {
      estimatedRepCount: estimatedReps,
      repConfidence: Number(confidence.toFixed(2)),
      mainMovementAngleUsed: bestAngleName,
    };
  }
}
