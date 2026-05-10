/**
 * Type definitions for pose estimation data structures
 */

export type LandmarkName =
  | 'nose'
  | 'leftEye'
  | 'rightEye'
  | 'leftEar'
  | 'rightEar'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'
  | 'leftHeel'
  | 'rightHeel'
  | 'leftFootIndex'
  | 'rightFootIndex';

export type AngleName =
  | 'leftKnee'
  | 'rightKnee'
  | 'leftHip'
  | 'rightHip'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'torsoLean';

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface LandmarkCoord {
  x: number;
  y: number;
  z: number;
}

export interface Angle {
  value: number | null;
  confidence: number | null;
}

export interface FrameData {
  frameIndex: number;
  timestampMs: number;
  landmarks: Partial<Record<LandmarkName, Landmark>>;
  angles: Partial<Record<AngleName, Angle>>;
}

export interface FrameMetadata {
  frameIndex: number;
  frameNumber: number;
  timestampMs: number;
  imagePath: string;
}

export interface VideoMetadata {
  fps: number;
  durationMs: number;
  totalFramesInVideo: number;
  sampledFrameCount: number;
  frameSamplingRate: string;
}

export interface QualityMetrics {
  personDetected: boolean;
  averageLandmarkConfidence: number;
  lowConfidenceFrames: number[];
  warnings: string[];
}

export interface SourceModel {
  name: string;
  landmarkCount: number;
}

export interface PoseAnalysisResponse {
  videoId: string;
  sourceModel: SourceModel;
  metadata: VideoMetadata;
  quality: QualityMetrics;
  frames: FrameData[];
  summary?: MovementSummaryResult;
}

/**
 * Summary statistics for a single angle timeline
 */
export interface AngleSummaryStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
  standardDeviation: number | null;
  validFrameCount: number;
  missingFrameCount: number;
  confidenceAvg: number | null;
}

/**
 * Symmetry metrics between left/right body parts
 */
export interface SymmetryMetrics {
  kneeDifferenceAvg: number | null;
  hipDifferenceAvg: number | null;
  elbowDifferenceAvg: number | null;
  shoulderDifferenceAvg: number | null;
  overallSymmetryScore: number | null;
}

export type CameraView = 'SIDE_VIEW' | 'FRONT_VIEW' | 'UNKNOWN';
export type ReliableSide = 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN';

export interface CameraAwarePoseContext {
  cameraView: CameraView;
  cameraViewConfidence: number;
  reliableSide: ReliableSide;
  symmetryAvailable: boolean;
  ignoredReasons: string[];
  ignoredMetrics: string[];
  sideConfidence: {
    leftAverageVisibility: number | null;
    rightAverageVisibility: number | null;
    leftReliableFramePercentage: number;
    rightReliableFramePercentage: number;
  };
  poseMetrics: {
    squatDepth: string;
    backAngle: string;
    kneeTravel: string;
    heelLift: string;
    visibleSideKneeHipAnkleAlignment: string;
  };
}

export type MetricInterpretation =
  | 'good'
  | 'acceptable'
  | 'limited'
  | 'excessive_but_controlled'
  | 'problematic'
  | 'normal_for_exercise'
  | 'slightly_high'
  | 'smooth'
  | 'slightly_unstable'
  | 'unstable'
  | 'not_available';

export interface ScoringMetric {
  metric: string;
  value: string | number | null;
  interpretation: MetricInterpretation;
  confidence: number;
  sourceLandmarks: LandmarkName[];
  usableForScoring: boolean;
  ignoredReason?: string;
}

export interface ExerciseScoringContext {
  exerciseType: string | null;
  cameraView: CameraView;
  cameraViewConfidence: number;
  ignoredMetrics: string[];
  metrics: {
    rangeOfMotion: ScoringMetric;
    bodyLean: ScoringMetric;
    movementControl: ScoringMetric;
    leftRightSymmetry: ScoringMetric;
  };
  scoringGuidance: string[];
}

/**
 * Movement consistency and stability metrics
 */
export interface MovementConsistency {
  overallConsistencyScore: number | null;
  averageAngleVariability: number | null;
  torsoLeanStandardDeviation: number | null;
}

/**
 * Data quality and reliability metrics
 */
export interface DataReliability {
  averageLandmarkConfidence: number | null;
  lowConfidenceFramePercentage: number;
  missingAnglePercentage: number;
  sampledFrameCount: number;
}

/**
 * Repetition estimation metrics
 */
export interface RepetitionMetrics {
  estimatedRepCount: number | null;
  repConfidence: number;
  mainMovementAngleUsed: AngleName | null;
}

/**
 * Complete movement summary derived from pose analysis
 * Contains objective numeric metrics designed to be consumed by LLM-based interpretation
 */
export interface MovementSummaryResult {
  exerciseType: string | null;
  cameraContext: CameraAwarePoseContext;
  scoringContext: ExerciseScoringContext;
  repMetrics: RepetitionMetrics;
  angleSummary: Partial<Record<AngleName, AngleSummaryStats>>;
  symmetry: SymmetryMetrics;
  movementConsistency: MovementConsistency;
  dataReliability: DataReliability;
}

export interface EvaluationIssue {
  title: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  suggestion: string;
}

export interface ExerciseEvaluationResult {
  exerciseType: string;
  score: number;
  isGoodTechnique: boolean;
  scoreExplanation: string;
  overallSummary: string;
  positiveFeedback: string[];
  issues: EvaluationIssue[];
  recommendations: string[];
  dataReliabilityNote: string;
  cameraView: CameraView;
  ignoredMetrics: string[];
}
