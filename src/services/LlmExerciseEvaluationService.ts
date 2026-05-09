/**
 * LlmExerciseEvaluationService - Calls Groq API to evaluate exercise form.
 */

import { config } from '../config/env';
import { MovementSummaryResult, ExerciseEvaluationResult } from '../models/PoseTypes';
import { ExerciseEvaluationPromptBuilder } from './ExerciseEvaluationPromptBuilder';
import { LlmResponseValidator } from './LlmResponseValidator';

export class LlmExerciseEvaluationService {
  static async evaluate(
    exerciseType: string,
    movementSummary: MovementSummaryResult
  ): Promise<ExerciseEvaluationResult> {
    if (!config.groqApiKey) {
      throw new Error('Missing GROQ_API_KEY in environment variables');
    }

    const model = config.groqModel || 'llama-3.1-8b-instant';
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const prompt = ExerciseEvaluationPromptBuilder.buildPrompt(exerciseType, movementSummary);

    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an exercise form evaluation assistant. Use only the provided numeric metrics to evaluate form.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq API request failed with status ${response.status}: ${text}`);
    }

    const result = await response.json();
    const rawContent = this.extractTextFromGroqResponse(result);

    return LlmResponseValidator.validateAndParse(rawContent);
  }

  private static extractTextFromGroqResponse(response: any): string {
    if (!response) {
      throw new Error('Groq API returned an empty response');
    }

    if (response.output && Array.isArray(response.output) && response.output.length > 0) {
      const firstOutput = response.output[0];
      if (firstOutput.content && Array.isArray(firstOutput.content) && firstOutput.content.length > 0) {
        const firstContent = firstOutput.content[0];
        if (typeof firstContent.text === 'string') {
          return firstContent.text;
        }
      }
    }

    if (Array.isArray(response.choices)) {
      const firstChoice = response.choices[0];
      if (firstChoice?.message?.content) {
        return firstChoice.message.content;
      }
      if (typeof firstChoice?.text === 'string') {
        return firstChoice.text;
      }
    }

    throw new Error('Groq API response format is not supported or missing text output');
  }
}
