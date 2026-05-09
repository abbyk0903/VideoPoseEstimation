/**
 * Exercise evaluation routes
 */

import { Router } from 'express';
import { PoseController } from '../controllers/PoseController';

const router = Router();

/**
 * POST /api/exercise/evaluate
 * Evaluate exercise form using summarized movement metrics and an LLM.
 */
router.post('/evaluate', (req, res) => {
  PoseController.evaluateExercise(req, res);
});

export default router;
