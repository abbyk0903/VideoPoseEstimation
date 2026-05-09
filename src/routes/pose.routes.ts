/**
 * Pose estimation routes
 */

import { Router } from 'express';
import { PoseController } from '../controllers/PoseController';

const router = Router();

/**
 * POST /api/pose/analyze-video
 * Analyze an uploaded exercise video and return pose estimation data
 * Query params:
 *   - includeSummary=true (optional) - Include movement summary in response
 */
router.post('/analyze-video', (req, res) => {
  PoseController.analyzeVideo(req, res);
});

/**
 * POST /api/pose/summarize
 * Summarize movement data from existing pose analysis
 * 
 * Request body:
 * {
 *   "exerciseType": "squat" | null,
 *   "poseAnalysis": { full pose analysis result }
 * }
 */
router.post('/summarize', (req, res) => {
  PoseController.summarizeMovement(req, res);
});

/**
 * GET /api/pose/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  PoseController.healthCheck(req, res);
});

export default router;
