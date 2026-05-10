/**
 * LlmExerciseEvaluationService - Calls Groq API to evaluate exercise form.
 */

import { config } from '../config/env';
import { MovementSummaryResult, ExerciseEvaluationResult } from '../models/PoseTypes';
import { ExerciseEvaluationPromptBuilder } from './ExerciseEvaluationPromptBuilder';
import { LlmResponseValidator } from './LlmResponseValidator';

type GroqChatPayload = {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  temperature: number;
  max_tokens: number;
  response_format?: { type: 'json_object' };
};

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

    const payload: GroqChatPayload = {
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
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    };

    const result = await this.createChatCompletion(url, payload);
    const rawContent = this.extractTextFromGroqResponse(result);

    return LlmResponseValidator.validateAndParse(rawContent);
  }

  private static async createChatCompletion(url: string, payload: GroqChatPayload): Promise<any> {
    const response = await this.postChatCompletion(url, payload);
    if (response.ok) {
      return response.json();
    }

    const text = await response.text();
    const canRetryWithoutJsonMode =
      payload.response_format &&
      response.status >= 400 &&
      response.status < 500 &&
      text.toLowerCase().includes('response_format');

    if (canRetryWithoutJsonMode) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.response_format;
      const fallbackResponse = await this.postChatCompletion(url, fallbackPayload);
      if (fallbackResponse.ok) {
        return fallbackResponse.json();
      }

      const fallbackText = await fallbackResponse.text();
      throw new Error(`Groq API request failed with status ${fallbackResponse.status}: ${fallbackText}`);
    }

    throw new Error(`Groq API request failed with status ${response.status}: ${text}`);
  }

  private static postChatCompletion(url: string, payload: GroqChatPayload): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify(payload),
    });
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
