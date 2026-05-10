/**
 * Validates the LLM response for exercise evaluation.
 */

import { ExerciseEvaluationResult, EvaluationIssue } from '../models/PoseTypes';

export class LlmResponseValidator {
  static validateAndParse(rawText: string): ExerciseEvaluationResult {
    let parsed: any;
    const jsonText = this.extractJsonObject(rawText);

    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error('Invalid LLM response: response is not valid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid LLM response: parsed content is not an object');
    }

    const requiredFields = [
      'exerciseType',
      'score',
      'scoreExplanation',
      'overallSummary',
      'positiveFeedback',
      'issues',
      'recommendations',
      'dataReliabilityNote',
    ];

    for (const field of requiredFields) {
      if (!(field in parsed)) {
        throw new Error(`Invalid LLM response: missing required field '${field}'`);
      }
    }

    if (typeof parsed.exerciseType !== 'string') {
      throw new Error('Invalid LLM response: exerciseType must be a string');
    }

    if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
      throw new Error('Invalid LLM response: score must be a number between 0 and 100');
    }

    if (typeof parsed.scoreExplanation !== 'string') {
      throw new Error('Invalid LLM response: scoreExplanation must be a string');
    }

    if (typeof parsed.overallSummary !== 'string') {
      throw new Error('Invalid LLM response: overallSummary must be a string');
    }

    if (!Array.isArray(parsed.positiveFeedback)) {
      throw new Error('Invalid LLM response: positiveFeedback must be an array');
    }

    if (!Array.isArray(parsed.issues)) {
      throw new Error('Invalid LLM response: issues must be an array');
    }

    if (!Array.isArray(parsed.recommendations)) {
      throw new Error('Invalid LLM response: recommendations must be an array');
    }

    if (typeof parsed.dataReliabilityNote !== 'string') {
      throw new Error('Invalid LLM response: dataReliabilityNote must be a string');
    }

    parsed.positiveFeedback = parsed.positiveFeedback.map((item: any) => {
      if (typeof item !== 'string') {
        throw new Error('Invalid LLM response: positiveFeedback must contain strings only');
      }
      return item;
    });

    parsed.recommendations = parsed.recommendations.map((item: any) => {
      if (typeof item !== 'string') {
        throw new Error('Invalid LLM response: recommendations must contain strings only');
      }
      return item;
    });

    parsed.issues = parsed.issues.map((item: any) => this.validateIssue(item));

    return parsed as ExerciseEvaluationResult;
  }

  private static extractJsonObject(rawText: string): string {
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedJson?.[1]) {
      return this.extractJsonObject(fencedJson[1]);
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    return trimmed;
  }

  private static validateIssue(item: any): EvaluationIssue {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid LLM response: issue item must be an object');
    }

    const fields = ['title', 'severity', 'explanation', 'suggestion'];
    for (const field of fields) {
      if (!(field in item)) {
        throw new Error(`Invalid LLM response: issue item missing field '${field}'`);
      }
    }

    if (typeof item.title !== 'string') {
      throw new Error('Invalid LLM response: issue.title must be a string');
    }

    if (!['low', 'medium', 'high'].includes(item.severity)) {
      throw new Error("Invalid LLM response: issue.severity must be 'low', 'medium', or 'high'");
    }

    if (typeof item.explanation !== 'string') {
      throw new Error('Invalid LLM response: issue.explanation must be a string');
    }

    if (typeof item.suggestion !== 'string') {
      throw new Error('Invalid LLM response: issue.suggestion must be a string');
    }

    return item as EvaluationIssue;
  }
}
