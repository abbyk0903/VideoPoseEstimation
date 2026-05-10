import {
  AngleName,
  AngleSummaryStats,
  CameraAwarePoseContext,
  ExerciseScoringContext,
  LandmarkName,
  MetricInterpretation,
  MovementConsistency,
  RepetitionMetrics,
  ScoringMetric,
  SymmetryMetrics,
} from '../models/PoseTypes';

type ScoringContextInput = {
  exerciseType: string | null;
  cameraContext: CameraAwarePoseContext;
  angleSummary: Partial<Record<AngleName, AngleSummaryStats>>;
  symmetry: SymmetryMetrics;
  movementConsistency: MovementConsistency;
  repMetrics: RepetitionMetrics;
};

const LOWER_BODY_EXERCISES = new Set(['squat', 'lunge', 'deadlift']);
const TORSO_LEAN_EXPECTED_EXERCISES = new Set(['deadlift', 'lunge']);

export class ExerciseScoringContextService {
  static build(input: ScoringContextInput): ExerciseScoringContext {
    const metrics = {
      rangeOfMotion: this.rangeOfMotionMetric(input.exerciseType, input.angleSummary, input.cameraContext),
      bodyLean: this.bodyLeanMetric(input.exerciseType, input.angleSummary, input.cameraContext),
      movementControl: this.movementControlMetric(input.repMetrics, input.movementConsistency, input.cameraContext),
      leftRightSymmetry: this.leftRightSymmetryMetric(input.cameraContext, input.symmetry),
    };

    const ignoredMetrics = [
      ...input.cameraContext.ignoredMetrics,
      ...Object.values(metrics)
        .filter((metric) => !metric.usableForScoring)
        .map((metric) => metric.metric),
    ].filter((metric, index, all) => all.indexOf(metric) === index);

    return {
      exerciseType: input.exerciseType,
      cameraView: input.cameraContext.cameraView,
      cameraViewConfidence: input.cameraContext.cameraViewConfidence,
      ignoredMetrics,
      metrics,
      scoringGuidance: [
        'Numeric deviations are signals, not automatic technique failures.',
        'Low scores below 50 require multiple reliable severe faults or clear unsafe movement.',
        'Unavailable or low-confidence metrics reduce certainty instead of directly reducing technique score.',
        'Only score a metric when it is reliable, relevant to the exercise, and visible from the camera angle.',
      ],
    };
  }

  private static rangeOfMotionMetric(
    exerciseType: string | null,
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>,
    cameraContext: CameraAwarePoseContext
  ): ScoringMetric {
    const exercise = this.normalizeExercise(exerciseType);
    const primaryAngles = this.primaryRangeAngles(exercise);
    const summaries = primaryAngles
      .map((angleName) => angleSummary[angleName])
      .filter((summary): summary is AngleSummaryStats => Boolean(summary));
    const confidence = this.averageConfidence(summaries, cameraContext.cameraViewConfidence);
    const usable = confidence >= 0.45 && summaries.some((summary) => summary.validFrameCount > 0);
    const deepestAngle = this.minValue(summaries);
    const largestRange = this.maxRange(summaries);

    if (!usable || deepestAngle === null) {
      return this.metric({
        metric: 'rangeOfMotion',
        value: null,
        interpretation: 'not_available',
        confidence,
        sourceLandmarks: this.sourceLandmarksForAngles(primaryAngles),
        usableForScoring: false,
        ignoredReason: 'Range of motion is not reliable enough from visible landmarks',
      });
    }

    let interpretation: MetricInterpretation = 'acceptable';
    if (LOWER_BODY_EXERCISES.has(exercise)) {
      if (deepestAngle <= 75) {
        interpretation = 'good';
      } else if (deepestAngle <= 105) {
        interpretation = 'acceptable';
      } else {
        interpretation = 'limited';
      }
    } else if (largestRange !== null && largestRange >= 35) {
      interpretation = 'good';
    }

    return this.metric({
      metric: 'rangeOfMotion',
      value: `deepest primary joint angle ${deepestAngle} degrees, largest range ${largestRange ?? 'unknown'} degrees`,
      interpretation,
      confidence,
      sourceLandmarks: this.sourceLandmarksForAngles(primaryAngles),
      usableForScoring: true,
    });
  }

  private static bodyLeanMetric(
    exerciseType: string | null,
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>,
    cameraContext: CameraAwarePoseContext
  ): ScoringMetric {
    const torsoLean = angleSummary.torsoLean;
    const confidence = this.clampConfidence((torsoLean?.confidenceAvg ?? 0) * cameraContext.cameraViewConfidence);

    if (!torsoLean || torsoLean.avg === null || confidence < 0.45) {
      return this.metric({
        metric: 'bodyLean',
        value: null,
        interpretation: 'not_available',
        confidence,
        sourceLandmarks: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
        usableForScoring: false,
        ignoredReason: 'Torso angle is not reliable enough for scoring',
      });
    }

    const exercise = this.normalizeExercise(exerciseType);
    let interpretation: MetricInterpretation = 'normal_for_exercise';
    if (!TORSO_LEAN_EXPECTED_EXERCISES.has(exercise) && torsoLean.avg > 45) {
      interpretation = 'problematic';
    } else if (!TORSO_LEAN_EXPECTED_EXERCISES.has(exercise) && torsoLean.avg > 30) {
      interpretation = 'slightly_high';
    }

    return this.metric({
      metric: 'bodyLean',
      value: `average torso lean ${torsoLean.avg} degrees`,
      interpretation,
      confidence,
      sourceLandmarks: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
      usableForScoring: true,
    });
  }

  private static movementControlMetric(
    repMetrics: RepetitionMetrics,
    movementConsistency: MovementConsistency,
    cameraContext: CameraAwarePoseContext
  ): ScoringMetric {
    const repConfidence = repMetrics.repConfidence ?? 0;
    const consistencyScore = movementConsistency.overallConsistencyScore ?? 0.5;
    const confidence = this.clampConfidence(((repConfidence + consistencyScore) / 2) * cameraContext.cameraViewConfidence);

    let interpretation: MetricInterpretation = 'smooth';
    if (confidence < 0.35) {
      interpretation = 'not_available';
    } else if (repConfidence < 0.35 && consistencyScore < 0.45) {
      interpretation = 'unstable';
    } else if (repConfidence < 0.55 || consistencyScore < 0.55) {
      interpretation = 'slightly_unstable';
    }

    return this.metric({
      metric: 'movementControl',
      value: `rep confidence ${repConfidence}, movement stability score ${movementConsistency.overallConsistencyScore ?? 'unknown'}`,
      interpretation,
      confidence,
      sourceLandmarks: [],
      usableForScoring: interpretation !== 'not_available',
      ignoredReason: interpretation === 'not_available'
        ? 'Movement control cannot be determined reliably from the sampled frames'
        : undefined,
    });
  }

  private static leftRightSymmetryMetric(
    cameraContext: CameraAwarePoseContext,
    symmetry: SymmetryMetrics
  ): ScoringMetric {
    if (!cameraContext.symmetryAvailable) {
      return this.metric({
        metric: 'leftRightSymmetry',
        value: null,
        interpretation: 'not_available',
        confidence: cameraContext.cameraViewConfidence,
        sourceLandmarks: [
          'leftShoulder',
          'rightShoulder',
          'leftHip',
          'rightHip',
          'leftKnee',
          'rightKnee',
          'leftAnkle',
          'rightAnkle',
        ],
        usableForScoring: false,
        ignoredReason: 'Symmetry is not reliably measurable from this camera angle',
      });
    }

    const score = symmetry.overallSymmetryScore;
    const confidence = this.clampConfidence(cameraContext.cameraViewConfidence);
    const interpretation: MetricInterpretation =
      score === null ? 'not_available' :
      score >= 0.8 ? 'good' :
      score >= 0.65 ? 'acceptable' :
      'problematic';

    return this.metric({
      metric: 'leftRightSymmetry',
      value: score,
      interpretation,
      confidence,
      sourceLandmarks: [
        'leftShoulder',
        'rightShoulder',
        'leftHip',
        'rightHip',
        'leftKnee',
        'rightKnee',
        'leftAnkle',
        'rightAnkle',
      ],
      usableForScoring: interpretation !== 'not_available',
      ignoredReason: interpretation === 'not_available'
        ? 'Both body sides are not reliably visible'
        : undefined,
    });
  }

  private static primaryRangeAngles(exercise: string): AngleName[] {
    if (exercise.includes('push')) {
      return ['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder'];
    }
    if (exercise.includes('curl')) {
      return ['leftElbow', 'rightElbow'];
    }
    if (exercise.includes('press')) {
      return ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow'];
    }
    return ['leftKnee', 'rightKnee', 'leftHip', 'rightHip'];
  }

  private static sourceLandmarksForAngles(angles: AngleName[]): LandmarkName[] {
    const landmarks = new Set<LandmarkName>();
    angles.forEach((angle) => {
      if (angle.includes('Knee')) {
        landmarks.add(angle.startsWith('left') ? 'leftHip' : 'rightHip');
        landmarks.add(angle.startsWith('left') ? 'leftKnee' : 'rightKnee');
        landmarks.add(angle.startsWith('left') ? 'leftAnkle' : 'rightAnkle');
      }
      if (angle.includes('Hip')) {
        landmarks.add(angle.startsWith('left') ? 'leftShoulder' : 'rightShoulder');
        landmarks.add(angle.startsWith('left') ? 'leftHip' : 'rightHip');
        landmarks.add(angle.startsWith('left') ? 'leftKnee' : 'rightKnee');
      }
      if (angle.includes('Elbow')) {
        landmarks.add(angle.startsWith('left') ? 'leftShoulder' : 'rightShoulder');
        landmarks.add(angle.startsWith('left') ? 'leftElbow' : 'rightElbow');
        landmarks.add(angle.startsWith('left') ? 'leftWrist' : 'rightWrist');
      }
      if (angle.includes('Shoulder')) {
        landmarks.add(angle.startsWith('left') ? 'leftElbow' : 'rightElbow');
        landmarks.add(angle.startsWith('left') ? 'leftShoulder' : 'rightShoulder');
        landmarks.add(angle.startsWith('left') ? 'leftHip' : 'rightHip');
      }
    });
    return Array.from(landmarks);
  }

  private static averageConfidence(
    summaries: AngleSummaryStats[],
    cameraViewConfidence: number
  ): number {
    if (summaries.length === 0) {
      return 0;
    }

    const confidenceSum = summaries.reduce((sum, summary) => sum + (summary.confidenceAvg ?? 0), 0);
    return this.clampConfidence((confidenceSum / summaries.length) * cameraViewConfidence);
  }

  private static minValue(summaries: AngleSummaryStats[]): number | null {
    const values = summaries
      .map((summary) => summary.min)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.min(...values) : null;
  }

  private static maxRange(summaries: AngleSummaryStats[]): number | null {
    const values = summaries
      .map((summary) => summary.range)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.max(...values) : null;
  }

  private static metric(metric: ScoringMetric): ScoringMetric {
    return {
      ...metric,
      confidence: Number(this.clampConfidence(metric.confidence).toFixed(2)),
    };
  }

  private static clampConfidence(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private static normalizeExercise(exerciseType: string | null): string {
    return (exerciseType || '').trim().toLowerCase();
  }
}
