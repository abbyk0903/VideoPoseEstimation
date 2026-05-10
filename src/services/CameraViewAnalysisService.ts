import {
  AngleName,
  AngleSummaryStats,
  CameraAwarePoseContext,
  CameraView,
  FrameData,
  Landmark,
  LandmarkName,
  ReliableSide,
} from '../models/PoseTypes';
import { calculateAverage } from '../utils/stats';

const LEFT_SIDE_LANDMARKS: LandmarkName[] = ['leftShoulder', 'leftHip', 'leftKnee', 'leftAnkle'];
const RIGHT_SIDE_LANDMARKS: LandmarkName[] = ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle'];
const LEFT_VISIBLE_SIDE_LANDMARKS: LandmarkName[] = ['leftHip', 'leftKnee', 'leftAnkle', 'leftHeel', 'leftFootIndex'];
const RIGHT_VISIBLE_SIDE_LANDMARKS: LandmarkName[] = ['rightHip', 'rightKnee', 'rightAnkle', 'rightHeel', 'rightFootIndex'];
const LEFT_RIGHT_PAIRS: Array<[LandmarkName, LandmarkName]> = [
  ['leftShoulder', 'rightShoulder'],
  ['leftHip', 'rightHip'],
  ['leftKnee', 'rightKnee'],
  ['leftAnkle', 'rightAnkle'],
];

const VISIBILITY_IMBALANCE_THRESHOLD = 0.2;
const FRONT_VIEW_WIDTH_RATIO = 0.12;
const SYMMETRY_MIN_CAMERA_CONFIDENCE = 0.8;
const SYMMETRY_MIN_SIDE_VISIBILITY = 0.65;
const SYMMETRY_MAX_SIDE_VISIBILITY_DIFFERENCE = 0.15;
const SYMMETRY_REQUIRED_EXERCISES = new Set([
  'squat',
  'push-up',
  'pushup',
  'shoulder press',
  'overhead press',
  'biceps curl',
  'bench press',
]);

export class CameraViewAnalysisService {
  static analyze(
    frames: FrameData[],
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>,
    minVisibility: number,
    exerciseType: string | null
  ): CameraAwarePoseContext {
    const leftAverageVisibility = this.averageSideVisibility(frames, LEFT_SIDE_LANDMARKS);
    const rightAverageVisibility = this.averageSideVisibility(frames, RIGHT_SIDE_LANDMARKS);
    const leftReliableFramePercentage = this.reliableFramePercentage(frames, LEFT_SIDE_LANDMARKS, minVisibility);
    const rightReliableFramePercentage = this.reliableFramePercentage(frames, RIGHT_SIDE_LANDMARKS, minVisibility);

    const leftReliable = this.isSideReliable(leftAverageVisibility, leftReliableFramePercentage, minVisibility);
    const rightReliable = this.isSideReliable(rightAverageVisibility, rightReliableFramePercentage, minVisibility);
    const geometryRatio = this.averageBodyWidthRatio(frames, minVisibility);
    const visibilityDifference = Math.abs((leftAverageVisibility ?? 0) - (rightAverageVisibility ?? 0));

    const cameraView = this.classifyCameraView({
      leftReliable,
      rightReliable,
      visibilityDifference,
      geometryRatio,
    });
    const cameraViewConfidence = this.calculateCameraViewConfidence({
      cameraView,
      leftReliable,
      rightReliable,
      visibilityDifference,
      geometryRatio,
    });
    const reliableSide = this.getReliableSide(leftAverageVisibility, rightAverageVisibility, leftReliable, rightReliable);
    const exerciseRequiresSymmetry = this.exerciseRequiresSymmetry(exerciseType);
    const symmetryAvailable = this.isSymmetryAvailable({
      cameraView,
      cameraViewConfidence,
      leftAverageVisibility,
      rightAverageVisibility,
      visibilityDifference,
      exerciseRequiresSymmetry,
    });
    const ignoredReasons = this.getIgnoredReasons({
      cameraView,
      cameraViewConfidence,
      reliableSide,
      symmetryAvailable,
      leftAverageVisibility,
      rightAverageVisibility,
      minVisibility,
      exerciseRequiresSymmetry,
    });
    const ignoredMetrics = symmetryAvailable ? [] : ['leftRightSymmetry'];

    return {
      cameraView,
      cameraViewConfidence,
      reliableSide,
      symmetryAvailable,
      ignoredReasons,
      ignoredMetrics,
      sideConfidence: {
        leftAverageVisibility: this.roundNullable(leftAverageVisibility),
        rightAverageVisibility: this.roundNullable(rightAverageVisibility),
        leftReliableFramePercentage: Number(leftReliableFramePercentage.toFixed(1)),
        rightReliableFramePercentage: Number(rightReliableFramePercentage.toFixed(1)),
      },
      poseMetrics: {
        squatDepth: this.describeSquatDepth(angleSummary, reliableSide, symmetryAvailable),
        backAngle: this.describeBackAngle(angleSummary),
        kneeTravel: this.describeKneeTravel(frames, reliableSide, minVisibility),
        heelLift: this.describeHeelLift(frames, reliableSide, minVisibility),
        visibleSideKneeHipAnkleAlignment: this.describeVisibleSideAlignment(frames, reliableSide, minVisibility),
      },
    };
  }

  private static calculateCameraViewConfidence(input: {
    cameraView: CameraView;
    leftReliable: boolean;
    rightReliable: boolean;
    visibilityDifference: number;
    geometryRatio: number | null;
  }): number {
    if (input.cameraView === 'FRONT_VIEW') {
      const geometryConfidence = input.geometryRatio === null
        ? 0
        : Math.min(input.geometryRatio / FRONT_VIEW_WIDTH_RATIO, 1);
      const visibilityBalanceConfidence = Math.max(
        0,
        1 - input.visibilityDifference / SYMMETRY_MAX_SIDE_VISIBILITY_DIFFERENCE
      );
      const sideReliabilityConfidence = input.leftReliable && input.rightReliable ? 1 : 0;
      return Number(((geometryConfidence + visibilityBalanceConfidence + sideReliabilityConfidence) / 3).toFixed(2));
    }

    if (input.cameraView === 'SIDE_VIEW') {
      const imbalanceConfidence = Math.min(input.visibilityDifference / VISIBILITY_IMBALANCE_THRESHOLD, 1);
      const reliabilityConfidence = input.leftReliable !== input.rightReliable ? 1 : 0.5;
      return Number(((imbalanceConfidence + reliabilityConfidence) / 2).toFixed(2));
    }

    return 0.5;
  }

  private static isSymmetryAvailable(input: {
    cameraView: CameraView;
    cameraViewConfidence: number;
    leftAverageVisibility: number | null;
    rightAverageVisibility: number | null;
    visibilityDifference: number;
    exerciseRequiresSymmetry: boolean;
  }): boolean {
    return input.cameraView === 'FRONT_VIEW' &&
      input.cameraViewConfidence >= SYMMETRY_MIN_CAMERA_CONFIDENCE &&
      (input.leftAverageVisibility ?? 0) >= SYMMETRY_MIN_SIDE_VISIBILITY &&
      (input.rightAverageVisibility ?? 0) >= SYMMETRY_MIN_SIDE_VISIBILITY &&
      input.visibilityDifference <= SYMMETRY_MAX_SIDE_VISIBILITY_DIFFERENCE &&
      input.exerciseRequiresSymmetry;
  }

  private static classifyCameraView(input: {
    leftReliable: boolean;
    rightReliable: boolean;
    visibilityDifference: number;
    geometryRatio: number | null;
  }): CameraView {
    if (input.visibilityDifference >= VISIBILITY_IMBALANCE_THRESHOLD && input.leftReliable !== input.rightReliable) {
      return 'SIDE_VIEW';
    }

    if (input.leftReliable && input.rightReliable) {
      if (input.geometryRatio !== null && input.geometryRatio >= FRONT_VIEW_WIDTH_RATIO) {
        return 'FRONT_VIEW';
      }
      return 'UNKNOWN';
    }

    if (input.leftReliable || input.rightReliable) {
      return 'SIDE_VIEW';
    }

    return 'UNKNOWN';
  }

  private static getReliableSide(
    leftAverageVisibility: number | null,
    rightAverageVisibility: number | null,
    leftReliable: boolean,
    rightReliable: boolean
  ): ReliableSide {
    if (leftReliable && rightReliable) {
      return 'BOTH';
    }
    if (leftReliable) {
      return 'LEFT';
    }
    if (rightReliable) {
      return 'RIGHT';
    }

    const left = leftAverageVisibility ?? 0;
    const right = rightAverageVisibility ?? 0;
    if (Math.abs(left - right) < VISIBILITY_IMBALANCE_THRESHOLD) {
      return 'UNKNOWN';
    }
    return left > right ? 'LEFT' : 'RIGHT';
  }

  private static getIgnoredReasons(input: {
    cameraView: CameraView;
    cameraViewConfidence: number;
    reliableSide: ReliableSide;
    symmetryAvailable: boolean;
    leftAverageVisibility: number | null;
    rightAverageVisibility: number | null;
    minVisibility: number;
    exerciseRequiresSymmetry: boolean;
  }): string[] {
    const reasons: string[] = [];

    if ((input.leftAverageVisibility ?? 0) < input.minVisibility) {
      reasons.push('Left side landmarks have low visibility');
    }
    if ((input.rightAverageVisibility ?? 0) < input.minVisibility) {
      reasons.push('Right side landmarks have low visibility');
    }
    if (input.cameraView === 'SIDE_VIEW') {
      reasons.push('Video appears to be filmed from the side');
    }
    if (!input.symmetryAvailable) {
      reasons.push('Do not penalize left-right asymmetry because symmetry is not reliably measurable in this video');
    }
    if (input.cameraView === 'UNKNOWN') {
      reasons.push('Camera view is unknown and is treated like side view for symmetry scoring');
    }
    if (input.cameraView === 'FRONT_VIEW' && input.cameraViewConfidence < SYMMETRY_MIN_CAMERA_CONFIDENCE) {
      reasons.push('Front-view confidence is too low for symmetry scoring');
    }
    if (!input.exerciseRequiresSymmetry) {
      reasons.push('Current exercise does not opt in to left-right symmetry scoring');
    }
    if (input.reliableSide === 'UNKNOWN') {
      reasons.push('No body side is reliable enough for side-specific scoring');
    }

    return reasons;
  }

  private static exerciseRequiresSymmetry(exerciseType: string | null): boolean {
    if (!exerciseType) {
      return false;
    }

    return SYMMETRY_REQUIRED_EXERCISES.has(exerciseType.trim().toLowerCase());
  }

  private static averageSideVisibility(frames: FrameData[], landmarks: LandmarkName[]): number | null {
    const values = frames.flatMap((frame) =>
      landmarks
        .map((name) => frame.landmarks[name]?.visibility)
        .filter((value): value is number => typeof value === 'number')
    );
    return calculateAverage(values);
  }

  private static reliableFramePercentage(
    frames: FrameData[],
    landmarks: LandmarkName[],
    minVisibility: number
  ): number {
    if (frames.length === 0) {
      return 0;
    }

    const reliableFrameCount = frames.filter((frame) => {
      const values = landmarks
        .map((name) => frame.landmarks[name]?.visibility)
        .filter((value): value is number => typeof value === 'number');
      const average = calculateAverage(values);
      return average !== null && average >= minVisibility;
    }).length;

    return (reliableFrameCount / frames.length) * 100;
  }

  private static isSideReliable(
    averageVisibility: number | null,
    reliableFramePercentage: number,
    minVisibility: number
  ): boolean {
    return averageVisibility !== null && averageVisibility >= minVisibility && reliableFramePercentage >= 50;
  }

  private static averageBodyWidthRatio(frames: FrameData[], minVisibility: number): number | null {
    const ratios = frames
      .map((frame) => {
        const bodyHeight = this.estimateBodyHeight(frame, minVisibility);
        const widths = LEFT_RIGHT_PAIRS
          .map(([leftName, rightName]) => this.horizontalDistance(frame.landmarks[leftName], frame.landmarks[rightName], minVisibility))
          .filter((value): value is number => value !== null);
        const averageWidth = calculateAverage(widths);

        if (!bodyHeight || averageWidth === null) {
          return null;
        }

        return averageWidth / bodyHeight;
      })
      .filter((value): value is number => value !== null);

    return calculateAverage(ratios);
  }

  private static estimateBodyHeight(frame: FrameData, minVisibility: number): number | null {
    const visibleLandmarks = Object.values(frame.landmarks)
      .filter((landmark): landmark is Landmark => Boolean(landmark) && landmark.visibility >= minVisibility);

    if (visibleLandmarks.length < 2) {
      return null;
    }

    const yValues = visibleLandmarks.map((landmark) => landmark.y);
    const height = Math.max(...yValues) - Math.min(...yValues);
    return height > 0 ? height : null;
  }

  private static horizontalDistance(
    left: Landmark | undefined,
    right: Landmark | undefined,
    minVisibility: number
  ): number | null {
    if (!left || !right || left.visibility < minVisibility || right.visibility < minVisibility) {
      return null;
    }
    return Math.abs(left.x - right.x);
  }

  private static describeSquatDepth(
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>,
    reliableSide: ReliableSide,
    symmetryAvailable: boolean
  ): string {
    const angles = this.selectSideAngleSummaries(angleSummary, reliableSide, symmetryAvailable, 'Knee');
    const minValues = angles.map((angle) => angle?.min ?? null).filter((value): value is number => value !== null);
    const minKneeAngle = calculateAverage(minValues);

    if (minKneeAngle === null) {
      return 'not enough visual information';
    }

    return `minimum visible knee angle ${Number(minKneeAngle.toFixed(1))} degrees`;
  }

  private static describeBackAngle(angleSummary: Partial<Record<AngleName, AngleSummaryStats>>): string {
    const torsoLean = angleSummary.torsoLean;
    if (!torsoLean || torsoLean.avg === null) {
      return 'not enough visual information';
    }

    const maxText = torsoLean.max !== null ? `, max ${torsoLean.max} degrees` : '';
    return `average torso lean ${torsoLean.avg} degrees${maxText}`;
  }

  private static describeKneeTravel(frames: FrameData[], reliableSide: ReliableSide, minVisibility: number): string {
    const sides = this.selectSides(reliableSide);
    const offsets = sides.flatMap((side) => this.kneeAnkleOffsets(frames, side, minVisibility));
    const averageOffset = calculateAverage(offsets);

    if (averageOffset === null) {
      return 'not enough visual information';
    }

    return `average visible knee-to-ankle horizontal offset ${Number(averageOffset.toFixed(3))} normalized image units`;
  }

  private static describeHeelLift(frames: FrameData[], reliableSide: ReliableSide, minVisibility: number): string {
    const sides = this.selectSides(reliableSide);
    const offsets = sides.flatMap((side) => this.heelAnkleVerticalOffsets(frames, side, minVisibility));
    const averageOffset = calculateAverage(offsets);

    if (averageOffset === null) {
      return 'not enough visual information';
    }

    return `average heel-to-ankle vertical offset ${Number(averageOffset.toFixed(3))} normalized image units`;
  }

  private static describeVisibleSideAlignment(
    frames: FrameData[],
    reliableSide: ReliableSide,
    minVisibility: number
  ): string {
    const sides = this.selectSides(reliableSide);
    const offsets = sides.flatMap((side) => this.kneeLineOffsets(frames, side, minVisibility));
    const averageOffset = calculateAverage(offsets);

    if (averageOffset === null) {
      return 'not enough visual information';
    }

    return `average knee distance from hip-ankle line ${Number(averageOffset.toFixed(3))} normalized image units`;
  }

  private static selectSideAngleSummaries(
    angleSummary: Partial<Record<AngleName, AngleSummaryStats>>,
    reliableSide: ReliableSide,
    symmetryAvailable: boolean,
    joint: 'Knee' | 'Hip'
  ): Array<AngleSummaryStats | undefined> {
    if (symmetryAvailable || reliableSide === 'BOTH') {
      return [angleSummary[`left${joint}` as AngleName], angleSummary[`right${joint}` as AngleName]];
    }
    if (reliableSide === 'LEFT') {
      return [angleSummary[`left${joint}` as AngleName]];
    }
    if (reliableSide === 'RIGHT') {
      return [angleSummary[`right${joint}` as AngleName]];
    }
    return [];
  }

  private static selectSides(reliableSide: ReliableSide): Array<'LEFT' | 'RIGHT'> {
    if (reliableSide === 'LEFT') {
      return ['LEFT'];
    }
    if (reliableSide === 'RIGHT') {
      return ['RIGHT'];
    }
    if (reliableSide === 'BOTH') {
      return ['LEFT', 'RIGHT'];
    }
    return [];
  }

  private static kneeAnkleOffsets(frames: FrameData[], side: 'LEFT' | 'RIGHT', minVisibility: number): number[] {
    const kneeName = side === 'LEFT' ? 'leftKnee' : 'rightKnee';
    const ankleName = side === 'LEFT' ? 'leftAnkle' : 'rightAnkle';
    return frames
      .map((frame) => {
        const knee = frame.landmarks[kneeName];
        const ankle = frame.landmarks[ankleName];
        if (!this.isVisible(knee, minVisibility) || !this.isVisible(ankle, minVisibility)) {
          return null;
        }
        return Math.abs(knee.x - ankle.x);
      })
      .filter((value): value is number => value !== null);
  }

  private static heelAnkleVerticalOffsets(frames: FrameData[], side: 'LEFT' | 'RIGHT', minVisibility: number): number[] {
    const heelName = side === 'LEFT' ? 'leftHeel' : 'rightHeel';
    const ankleName = side === 'LEFT' ? 'leftAnkle' : 'rightAnkle';
    return frames
      .map((frame) => {
        const heel = frame.landmarks[heelName];
        const ankle = frame.landmarks[ankleName];
        if (!this.isVisible(heel, minVisibility) || !this.isVisible(ankle, minVisibility)) {
          return null;
        }
        return Math.abs(heel.y - ankle.y);
      })
      .filter((value): value is number => value !== null);
  }

  private static kneeLineOffsets(frames: FrameData[], side: 'LEFT' | 'RIGHT', minVisibility: number): number[] {
    const names = side === 'LEFT' ? LEFT_VISIBLE_SIDE_LANDMARKS : RIGHT_VISIBLE_SIDE_LANDMARKS;
    const [hipName, kneeName, ankleName] = names;

    return frames
      .map((frame) => {
        const hip = frame.landmarks[hipName];
        const knee = frame.landmarks[kneeName];
        const ankle = frame.landmarks[ankleName];

        if (!this.isVisible(hip, minVisibility) || !this.isVisible(knee, minVisibility) || !this.isVisible(ankle, minVisibility)) {
          return null;
        }

        return this.distancePointToLine(knee, hip, ankle);
      })
      .filter((value): value is number => value !== null);
  }

  private static distancePointToLine(point: Landmark, lineStart: Landmark, lineEnd: Landmark): number {
    const numerator = Math.abs(
      (lineEnd.y - lineStart.y) * point.x -
        (lineEnd.x - lineStart.x) * point.y +
        lineEnd.x * lineStart.y -
        lineEnd.y * lineStart.x
    );
    const denominator = Math.sqrt(
      Math.pow(lineEnd.y - lineStart.y, 2) + Math.pow(lineEnd.x - lineStart.x, 2)
    );

    return denominator > 0 ? numerator / denominator : 0;
  }

  private static isVisible(landmark: Landmark | undefined, minVisibility: number): landmark is Landmark {
    return Boolean(landmark) && landmark!.visibility >= minVisibility;
  }

  private static roundNullable(value: number | null): number | null {
    return value === null ? null : Number(value.toFixed(2));
  }
}
