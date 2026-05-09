/**
 * PoseController - Handle pose estimation requests
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UploadedFile } from 'express-fileupload';
import path from 'path';

import { config } from '../config/env';
import { validateVideoUpload, generateVideoFilename } from '../utils/fileUpload';
import { removeFile, removeFiles, removeDirectory, getFilesInDirectory } from '../utils/cleanup';
import { FrameExtractionService } from '../services/FrameExtractionService';
import { MediaPipePoseEstimationService } from '../services/MediaPipePoseEstimationService';
import { AngleCalculationService, AngleCalculationOptions } from '../services/AngleCalculationService';
import { MovementSummaryService } from '../services/MovementSummaryService';
import { LlmExerciseEvaluationService } from '../services/LlmExerciseEvaluationService';
import {
  PoseAnalysisResponse,
  FrameData,
  QualityMetrics,
  VideoMetadata,
  SourceModel,
  MovementSummaryResult,
} from '../models/PoseTypes';
import { ensureDirectoryExists } from '../utils/cleanup';

export class PoseController {
  /**
   * Analyze an uploaded video and return pose estimation data
   */
  static async analyzeVideo(req: Request, res: Response): Promise<void> {
    let uploadedVideoPath: string | null = null;
    let frameExtractionDir: string | null = null;
    let videoId: string = '';

    try {
      // Validate upload
      const videoFile = req.files?.video as UploadedFile | undefined;
      const validation = validateVideoUpload(videoFile, config.maxVideoSizeMB);

      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      if (!videoFile) {
        res.status(400).json({ error: 'No video file provided' });
        return;
      }

      videoId = uuidv4();

      // Setup directories
      await ensureDirectoryExists(config.uploadDir);
      await ensureDirectoryExists(config.frameDir);

      // Save uploaded video
      const videoFilename = generateVideoFilename(videoFile.name, `video_${videoId}`);
      uploadedVideoPath = path.join(config.uploadDir, videoFilename);
      frameExtractionDir = path.join(config.frameDir, videoId);

      await videoFile.mv(uploadedVideoPath);

      console.log(`Video uploaded: ${uploadedVideoPath}`);

      // Get video metadata
      let videoInfo = await FrameExtractionService.getVideoInfo(uploadedVideoPath);

      // Warm MediaPipe while ffmpeg extracts frames.
      if (!MediaPipePoseEstimationService.isInitialized()) {
        console.log('Initializing MediaPipe...');
      }
      const mediaPipeReady = MediaPipePoseEstimationService.isInitialized()
        ? Promise.resolve()
        : MediaPipePoseEstimationService.initialize();

      // Extract frames
      console.log(`Extracting frames at ${config.frameSampleIntervalMs}ms intervals`);
      const extractedFrames = await FrameExtractionService.extractFrames(uploadedVideoPath, {
        sampleIntervalMs: config.frameSampleIntervalMs,
        outputDir: frameExtractionDir,
      });

      console.log(`Extracted ${extractedFrames.length} frames`);

      // Wait for MediaPipe if frame extraction finished first.
      await mediaPipeReady;

      // Process each frame
      const frameDataList: FrameData[] = [];
      const lowConfidenceFrames: number[] = [];
      const warnings: string[] = [];

      console.log(`Estimating poses for ${extractedFrames.length} frames`);
      const poseEstimationStartedAt = Date.now();
      const estimatedFrames = await MediaPipePoseEstimationService.estimatePoses(
        extractedFrames.map((frame) => ({
          framePath: frame.framePath,
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestampMs,
        }))
      );
      console.log(`Pose estimation completed in ${Date.now() - poseEstimationStartedAt}ms`);

      for (const frameData of estimatedFrames) {
        // Calculate angles
        const angleOptions: AngleCalculationOptions = {
          minVisibility: config.minLandmarkVisibility,
        };
        AngleCalculationService.calculateAngles(frameData, angleOptions);

        // Track low confidence frames
        const landmarkCount = Object.keys(frameData.landmarks).length;
        const landmarkConfidence = landmarkCount > 0
          ? Object.values(frameData.landmarks).reduce((sum, l) => sum + (l?.visibility || 0), 0) / landmarkCount
          : 0;

        if (landmarkConfidence < config.minLandmarkVisibility) {
          lowConfidenceFrames.push(frameData.frameIndex);
        }

        frameDataList.push(frameData);
      }

      // Calculate quality metrics
      const personDetected = frameDataList.some((f) => Object.keys(f.landmarks).length > 0);
      const averageLandmarkConfidence =
        frameDataList.length > 0
          ? frameDataList.reduce((sum, f) => {
              const frameConfidence =
                Object.values(f.landmarks).reduce((s, l) => s + (l?.visibility || 0), 0) /
                  Object.keys(f.landmarks).length || 0;
              return sum + frameConfidence;
            }, 0) / frameDataList.length
          : 0;

      if (!personDetected) {
        warnings.push('No person detected in most frames');
      }

      if (frameDataList.length === 0 || !personDetected) {
        res.status(422).json({
          error: 'Pose detection failed',
          details: warnings,
          metadata: {
            fps: videoInfo.fps,
            durationMs: videoInfo.durationMs,
            totalFramesInVideo: videoInfo.totalFramesEstimated,
            sampledFrameCount: frameDataList.length,
            extractedFrameCount: extractedFrames.length,
          },
        });
        return;
      }

      const quality: QualityMetrics = {
        personDetected,
        averageLandmarkConfidence: Number(averageLandmarkConfidence.toFixed(2)),
        lowConfidenceFrames,
        warnings,
      };

      const metadata: VideoMetadata = {
        fps: videoInfo.fps,
        durationMs: videoInfo.durationMs,
        totalFramesInVideo: videoInfo.totalFramesEstimated,
        sampledFrameCount: frameDataList.length,
        frameSamplingRate: `every ${config.frameSampleIntervalMs}ms`,
      };

      const sourceModel: SourceModel = {
        name: 'MediaPipe Pose',
        landmarkCount: 33,
      };

      const response: PoseAnalysisResponse = {
        videoId,
        sourceModel,
        metadata,
        quality,
        frames: frameDataList,
      };

      const includeSummary = req.query.includeSummary === 'true';
      const includeEvaluation = req.query.includeEvaluation === 'true';
      const exerciseType = (req.body.exerciseType || req.query.exerciseType || null) as string | null;

      if (includeEvaluation && !exerciseType) {
        res.status(400).json({ error: 'exerciseType is required when includeEvaluation=true' });
        return;
      }

      if (includeEvaluation) {
        const movementSummary = MovementSummaryService.summarize(response, exerciseType!);
        const evaluationStartedAt = Date.now();
        const evaluation = await LlmExerciseEvaluationService.evaluate(exerciseType!, movementSummary);
        console.log(`Groq evaluation completed in ${Date.now() - evaluationStartedAt}ms`);
        res.status(200).json({
          poseAnalysis: response,
          movementSummary,
          evaluation,
        });
        return;
      }

      if (includeSummary) {
        response.summary = MovementSummaryService.summarize(response, exerciseType);
      }

      res.status(200).json(response);
    } catch (error) {
      console.error('Error analyzing video:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (errorMessage.includes('probe')) {
        res.status(400).json({ error: 'Invalid video file format' });
      } else if (errorMessage.includes('extraction')) {
        res.status(500).json({ error: 'Frame extraction failed' });
      } else if (errorMessage.includes('MediaPipe runtime failed')) {
        res.status(500).json({
          error: 'Pose estimation runtime failed',
          details: errorMessage,
        });
      } else if (errorMessage.includes('MediaPipe')) {
        res.status(500).json({ error: 'Pose estimation service initialization failed' });
      } else {
        res.status(500).json({ error: 'Internal server error: ' + errorMessage });
      }
    } finally {
      // Cleanup temporary files
      try {
        if (uploadedVideoPath) {
          await removeFile(uploadedVideoPath);
          console.log(`Cleaned up uploaded video: ${uploadedVideoPath}`);
        }

        if (frameExtractionDir) {
          await removeDirectory(frameExtractionDir);
          console.log(`Cleaned up frame extraction directory: ${frameExtractionDir}`);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
  }

  /**
   * Summarize movement from existing pose analysis data
   */
  static async summarizeMovement(req: Request, res: Response): Promise<void> {
    try {
      const { exerciseType, poseAnalysis } = req.body;

      if (!poseAnalysis) {
        res.status(400).json({ error: 'poseAnalysis data is required in request body' });
        return;
      }

      // Validate that poseAnalysis has required structure
      if (!poseAnalysis.frames || !Array.isArray(poseAnalysis.frames)) {
        res.status(400).json({ error: 'Invalid poseAnalysis structure: frames array is required' });
        return;
      }

      // Generate movement summary
      const summary = MovementSummaryService.summarize(
        poseAnalysis,
        exerciseType || null
      );

      res.status(200).json(summary);
    } catch (error) {
      console.error('Error summarizing movement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        error: 'Internal server error: ' + errorMessage,
      });
    }
  }

  /**
   * Evaluate exercise form via LLM
   */
  static async evaluateExercise(req: Request, res: Response): Promise<void> {
    try {
      const { exerciseType, movementSummary } = req.body;

      if (!exerciseType || typeof exerciseType !== 'string') {
        res.status(400).json({ error: 'exerciseType is required in request body' });
        return;
      }

      if (!movementSummary) {
        res.status(400).json({ error: 'movementSummary is required in request body' });
        return;
      }

      const evaluation = await LlmExerciseEvaluationService.evaluate(
        exerciseType,
        movementSummary
      );

      res.status(200).json(evaluation);
    } catch (error) {
      console.error('Error evaluating exercise:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        error: 'Exercise evaluation failed',
        details: message,
      });
    }
  }

  /**
   * Health check endpoint
   */
  static healthCheck(req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      service: 'Exercise Pose Estimation API',
      mediapipeInitialized: MediaPipePoseEstimationService.isInitialized(),
    });
  }
}
