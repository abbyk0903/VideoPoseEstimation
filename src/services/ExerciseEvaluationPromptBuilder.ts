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

Evaluate the user’s form according to common biomechanics for the given exercise.
Use the numeric metrics to support your evaluation.
Do not invent measurements that are not present.
If confidence or data reliability is low, mention that clearly.
Return only valid JSON in the exact schema below and do not include any additional text:

{
  "exerciseType": "<exerciseType>",
  "score": 0,
  "scoreExplanation": "<brief explanation for the score>",
  "overallSummary": "<overall summary of the form>",
  "positiveFeedback": ["<positive observation>", "<positive observation>"] ,
  "issues": [
    {
      "title": "<issue title>",
      "severity": "low | medium | high",
      "explanation": "<explanation of the issue>",
      "suggestion": "<suggestion to improve>"
    }
  ],
  "recommendations": ["<recommendation>", "<recommendation>"],
  "dataReliabilityNote": "<note about reliability of evaluation based on data quality>"
}
`;
  }
}
