/**
 * AngleCalculationService - Calculate body joint angles from landmarks
 */

import { Angle, AngleName, Landmark, LandmarkName, FrameData } from '../models/PoseTypes';
import { calculateAngle, calculateMidpoint, clamp } from '../utils/math';

export interface AngleCalculationOptions {
  minVisibility: number;
}

export class AngleCalculationService {
  /**
   * Calculate all joint angles for a frame
   */
  static calculateAngles(frameData: FrameData, options: AngleCalculationOptions): void {
    const landmarks = frameData.landmarks;
    const angles: Partial<Record<AngleName, Angle>> = {};

    // 1. Left Knee: leftHip → leftKnee → leftAnkle
    angles.leftKnee = this.calculateJointAngle(
      landmarks.leftHip,
      landmarks.leftKnee,
      landmarks.leftAnkle,
      options.minVisibility
    );

    // 2. Right Knee: rightHip → rightKnee → rightAnkle
    angles.rightKnee = this.calculateJointAngle(
      landmarks.rightHip,
      landmarks.rightKnee,
      landmarks.rightAnkle,
      options.minVisibility
    );

    // 3. Left Hip: leftShoulder → leftHip → leftKnee
    angles.leftHip = this.calculateJointAngle(
      landmarks.leftShoulder,
      landmarks.leftHip,
      landmarks.leftKnee,
      options.minVisibility
    );

    // 4. Right Hip: rightShoulder → rightHip → rightKnee
    angles.rightHip = this.calculateJointAngle(
      landmarks.rightShoulder,
      landmarks.rightHip,
      landmarks.rightKnee,
      options.minVisibility
    );

    // 5. Left Elbow: leftShoulder → leftElbow → leftWrist
    angles.leftElbow = this.calculateJointAngle(
      landmarks.leftShoulder,
      landmarks.leftElbow,
      landmarks.leftWrist,
      options.minVisibility
    );

    // 6. Right Elbow: rightShoulder → rightElbow → rightWrist
    angles.rightElbow = this.calculateJointAngle(
      landmarks.rightShoulder,
      landmarks.rightElbow,
      landmarks.rightWrist,
      options.minVisibility
    );

    // 7. Left Shoulder: leftElbow → leftShoulder → leftHip
    angles.leftShoulder = this.calculateJointAngle(
      landmarks.leftElbow,
      landmarks.leftShoulder,
      landmarks.leftHip,
      options.minVisibility
    );

    // 8. Right Shoulder: rightElbow → rightShoulder → rightHip
    angles.rightShoulder = this.calculateJointAngle(
      landmarks.rightElbow,
      landmarks.rightShoulder,
      landmarks.rightHip,
      options.minVisibility
    );

    // 9. Torso Lean
    angles.torsoLean = this.calculateTorsoLean(landmarks, options.minVisibility);

    frameData.angles = angles;
  }

  /**
   * Calculate a single joint angle with confidence
   */
  private static calculateJointAngle(
    pointA: Landmark | undefined,
    pointB: Landmark | undefined,
    pointC: Landmark | undefined,
    minVisibility: number
  ): Angle {
    // Check if all landmarks exist and have sufficient visibility
    if (!pointA || !pointB || !pointC) {
      return { value: null, confidence: null };
    }

    if (pointA.visibility < minVisibility || pointB.visibility < minVisibility || pointC.visibility < minVisibility) {
      return { value: null, confidence: null };
    }

    const angleValue = calculateAngle(
      { x: pointA.x, y: pointA.y, z: pointA.z },
      { x: pointB.x, y: pointB.y, z: pointB.z },
      { x: pointC.x, y: pointC.y, z: pointC.z }
    );

    if (angleValue === null) {
      return { value: null, confidence: null };
    }

    // Confidence is based on the visibility of the three points
    const confidence = (pointA.visibility + pointB.visibility + pointC.visibility) / 3;

    return {
      value: Number(angleValue.toFixed(1)),
      confidence: Number(confidence.toFixed(2)),
    };
  }

  /**
   * Calculate torso lean angle
   * Measures the angle between the torso line and vertical axis
   */
  private static calculateTorsoLean(
    landmarks: Partial<Record<LandmarkName, Landmark>>,
    minVisibility: number
  ): Angle {
    const leftShoulder = landmarks.leftShoulder;
    const rightShoulder = landmarks.rightShoulder;
    const leftHip = landmarks.leftHip;
    const rightHip = landmarks.rightHip;

    // Check if all landmarks exist
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return { value: null, confidence: null };
    }

    // Check visibility
    if (
      leftShoulder.visibility < minVisibility ||
      rightShoulder.visibility < minVisibility ||
      leftHip.visibility < minVisibility ||
      rightHip.visibility < minVisibility
    ) {
      return { value: null, confidence: null };
    }

    try {
      // Calculate midpoints
      const shoulderMidpoint = calculateMidpoint(
        { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
        { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z }
      );

      const hipMidpoint = calculateMidpoint(
        { x: leftHip.x, y: leftHip.y, z: leftHip.z },
        { x: rightHip.x, y: rightHip.y, z: rightHip.z }
      );

      // Vector representing the torso (from hip to shoulder)
      const torsoVector = {
        x: shoulderMidpoint.x - hipMidpoint.x,
        y: shoulderMidpoint.y - hipMidpoint.y,
        z: shoulderMidpoint.z - hipMidpoint.z,
      };

      // Vertical axis (pointing up in normalized coordinates)
      const verticalVector = {
        x: 0,
        y: -1, // Negative because y increases downward in image space
        z: 0,
      };

      // Calculate angle between torso and vertical
      const torsoMagnitude = Math.sqrt(
        torsoVector.x * torsoVector.x + torsoVector.y * torsoVector.y + torsoVector.z * torsoVector.z
      );

      if (torsoMagnitude === 0) {
        return { value: null, confidence: null };
      }

      const dotProduct =
        torsoVector.x * verticalVector.x +
        torsoVector.y * verticalVector.y +
        torsoVector.z * verticalVector.z;

      let cosAngle = dotProduct / torsoMagnitude;
      cosAngle = clamp(cosAngle, -1, 1);

      const angleRadians = Math.acos(cosAngle);
      const angleDegrees = (angleRadians * 180) / Math.PI;

      // Confidence based on all four shoulder/hip points
      const confidence =
        (leftShoulder.visibility +
          rightShoulder.visibility +
          leftHip.visibility +
          rightHip.visibility) /
        4;

      return {
        value: Number(angleDegrees.toFixed(1)),
        confidence: Number(confidence.toFixed(2)),
      };
    } catch (error) {
      console.error('Error calculating torso lean:', error);
      return { value: null, confidence: null };
    }
  }
}
