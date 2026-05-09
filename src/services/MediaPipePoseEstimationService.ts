/**
 * MediaPipePoseEstimationService - Run pose estimation on frames
 */

import {
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import * as fs from 'fs';
import { Landmark, LandmarkName, FrameData } from '../models/PoseTypes';
import { calculateAverageVisibility } from '../utils/math';

// Map from MediaPipe landmark indices to names. Non-tracked indices are null.
const LANDMARK_NAMES: Array<LandmarkName | null> = [
  'nose', // 0
  null, // 1 leftEyeInner
  'leftEye', // 2
  null, // 3 leftEyeOuter
  null, // 4 rightEyeInner
  'rightEye', // 5
  null, // 6 rightEyeOuter
  'leftEar', // 7
  'rightEar', // 8
  null, // 9 mouthLeft
  null, // 10 mouthRight
  'leftShoulder', // 11
  'rightShoulder', // 12
  'leftElbow', // 13
  'rightElbow', // 14
  'leftWrist', // 15
  'rightWrist', // 16
  null, // 17 leftPinky
  null, // 18 rightPinky
  null, // 19 leftIndex
  null, // 20 rightIndex
  null, // 21 leftThumb
  null, // 22 rightThumb
  'leftHip', // 23
  'rightHip', // 24
  'leftKnee', // 25
  'rightKnee', // 26
  'leftAnkle', // 27
  'rightAnkle', // 28
  'leftHeel', // 29
  'rightHeel', // 30
  'leftFootIndex', // 31
  'rightFootIndex', // 32
];

export class MediaPipePoseEstimationService {
  private static poseLandmarker: PoseLandmarker | null = null;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize the MediaPipe pose model (singleton pattern)
   */
  static async initialize(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initializeModel();
    return this.initPromise;
  }

  /**
   * Internal model initialization
   */
  private static async _initializeModel(): Promise<void> {
    try {
      if (this.poseLandmarker) {
        return; // Already initialized
      }

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        },
        runningMode: 'IMAGE',
      });

      console.log('MediaPipe Pose Landmarker initialized successfully');
    } catch (error) {
      this.initPromise = null; // Reset to allow retry
      throw new Error(`Failed to initialize MediaPipe: ${error}`);
    }
  }

  /**
   * Estimate pose from a frame image
   */
  static async estimatePose(
    imagePath: string,
    frameIndex: number,
    timestampMs: number
  ): Promise<FrameData> {
    if (!this.poseLandmarker) {
      throw new Error('MediaPipe not initialized. Call initialize() first.');
    }

    try {
      // Read image file
      const imageData = fs.readFileSync(imagePath);
      const blob = new Blob([imageData], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);

      // Run pose detection
      const result = this.poseLandmarker.detect(bitmap as any);

      // Process landmarks
      const landmarks: Partial<Record<LandmarkName, Landmark>> = {};
      const visibilities: number[] = [];

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarkList = result.landmarks[0] as Array<{ x: number; y: number; z?: number; visibility?: number }>;

        landmarkList.forEach((landmark, index) => {
          const name = LANDMARK_NAMES[index];

          if (!name) {
            return;
          }

          landmarks[name] = {
            x: landmark.x,
            y: landmark.y,
            z: landmark.z || 0,
            visibility: landmark.visibility || 0,
          };
          visibilities.push(landmark.visibility || 0);
        });
      }

      const landmarkConfidence = calculateAverageVisibility(visibilities);

      return {
        frameIndex,
        timestampMs,
        landmarks,
        angles: {}, // Will be populated by AngleCalculationService
      };
    } catch (error) {
      console.error(`Failed to estimate pose for frame ${frameIndex}:`, error);
      return {
        frameIndex,
        timestampMs,
        landmarks: {},
        angles: {},
      };
    }
  }

  /**
   * Cleanup resources
   */
  static async cleanup(): Promise<void> {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    this.initPromise = null;
  }

  /**
   * Check if initialized
   */
  static isInitialized(): boolean {
    return this.poseLandmarker !== null;
  }
}
