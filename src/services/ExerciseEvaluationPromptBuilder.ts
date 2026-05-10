/**
 * Builds prompts for the exercise form evaluation LLM.
 */

import { MovementSummaryResult } from '../models/PoseTypes';

export class ExerciseEvaluationPromptBuilder {
  static buildPrompt(
    exerciseType: string,
    movementSummary: MovementSummaryResult
  ): string {
    const movementSummaryJson = JSON.stringify(movementSummary, null, 2);

    return `You are an exercise form evaluation assistant.
You receive numeric movement metrics extracted from a pose-estimation system.
The data is objective and comes from a pose estimation pipeline with no raw video frames or raw landmark coordinates.
The user performed this exercise: ${exerciseType}.

Here is the movement summary:
${movementSummaryJson}

Evaluate the user's form according to common biomechanics for the given exercise.
Use the numeric metrics to support your evaluation.
Do not invent measurements that are not present.
If confidence or data reliability is low, mention that clearly.
Global scoring rules:
- Do not score purely by hard numeric thresholds. Numeric values are signals, not automatic failures.
- Score by combined evidence. A single metric outside an ideal range must not create a very low score by itself.
- Scores below 50 require multiple clear, reliable, severe faults or high-confidence unsafe movement.
- Deep range of motion is positive or neutral unless combined with loss of control, unsafe joint collapse, unstable posture, relevant heel lift, or severe compensation.
- Body lean is exercise-specific. Do not penalize lean unless it is problematic for this exercise, extreme, and supported by instability or unsafe posture.
- Do not treat natural joint angle changes during a rep as inconsistency. Angles are expected to change during exercise.
- Movement variability should mean poor smoothness, poor control, sudden keypoint jumps, repeated alignment loss, or inconsistent repetitions.
- Low-confidence metrics should create uncertainty, not heavy score penalties.
- Do not penalize ignored or unavailable metrics.
- Use scoringContext.metrics as the primary scoring payload because it contains interpretation, confidence, source landmarks, and usableForScoring.
- A metric is a real issue only if it is reliable, relevant to the current exercise, visible from the camera angle, and supported by movement context.
Score bands:
- 85-100: strong technique, only minor comments.
- 70-84: generally good, some improvements.
- 55-69: acceptable but needs noticeable corrections.
- 40-54: several clear issues.
- below 40: multiple severe high-confidence faults or unsafe movement.
Camera-aware scoring rules:
- Left-right symmetry is opt-in and must only be evaluated when cameraContext.symmetryAvailable is true.
- If cameraContext.symmetryAvailable is false, you must say: "Do not penalize left-right asymmetry because symmetry is not reliably measurable in this video."
- If cameraContext.symmetryAvailable is false, do not reduce the score for left-right asymmetry and do not create asymmetry issues.
- Treat UNKNOWN camera view like SIDE_VIEW for symmetry scoring.
- In SIDE_VIEW, UNKNOWN, or low-confidence videos, evaluate only reliable visible metrics: joint angles, range of motion, movement stability, tempo/control, and posture/alignment visible from the camera angle.
- If any metric says "not enough visual information", mark that metric as unavailable in ignoredMetrics instead of penalizing it as bad technique.
- Include "leftRightSymmetry" in ignoredMetrics whenever cameraContext.ignoredMetrics includes it.
- Use cameraContext.ignoredReasons when explaining reliability limitations.
Reliability rules:
- Do not penalize any scoringContext metric where usableForScoring is false.
- If a scoringContext metric has confidence below 0.5, mention uncertainty instead of lowering the score heavily.
- If visible metrics are mostly acceptable and movementControl is smooth or slightly_unstable, the score should usually be moderate or high.
Return only valid JSON in the exact schema below and do not include any additional text.
The issue severity value must be exactly one of: "low", "medium", "high".

{
  "exerciseType": "<exerciseType>",
  "score": 0,
  "isGoodTechnique": false,
  "scoreExplanation": "<brief explanation for the score>",
  "overallSummary": "<overall summary of the form>",
  "positiveFeedback": ["<positive observation>", "<positive observation>"],
  "issues": [
    {
      "title": "<issue title>",
      "severity": "medium",
      "explanation": "<explanation of the issue>",
      "suggestion": "<suggestion to improve>"
    }
  ],
  "recommendations": ["<recommendation>", "<recommendation>"],
  "dataReliabilityNote": "<note about reliability of evaluation based on data quality>",
  "cameraView": "SIDE_VIEW",
  "ignoredMetrics": ["<metric ignored because it was unavailable or unreliable>"]
}
`;
  }
}
