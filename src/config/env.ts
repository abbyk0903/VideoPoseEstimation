/**
 * Environment configuration
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface Config {
  port: number;
  frameSampleIntervalMs: number;
  maxVideoSizeMB: number;
  minLandmarkVisibility: number;
  tempDir: string;
  uploadDir: string;
  frameDir: string;
  nodeEnv: string;
  groqApiKey: string | null;
  groqModel: string;
}

function getEnvVariable(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value) {
    console.warn(`Environment variable ${name} not set, using default: ${defaultValue}`);
    return defaultValue;
  }
  return value;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    console.warn(`Environment variable ${name} not set, using default: ${defaultValue}`);
    return defaultValue;
  }
  const num = Number(value);
  if (isNaN(num)) {
    console.warn(`Invalid number for ${name}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return num;
}

export const config: Config = {
  port: getEnvNumber('PORT', 4000),
  frameSampleIntervalMs: getEnvNumber('FRAME_SAMPLE_INTERVAL_MS', 200),
  maxVideoSizeMB: getEnvNumber('MAX_VIDEO_SIZE_MB', 100),
  minLandmarkVisibility: getEnvNumber('MIN_LANDMARK_VISIBILITY', 0.5),
  tempDir: getEnvVariable('TEMP_DIR', './temp'),
  uploadDir: getEnvVariable('UPLOAD_DIR', './uploads'),
  frameDir: getEnvVariable('FRAME_DIR', './frames'),
  nodeEnv: getEnvVariable('NODE_ENV', 'development'),
  groqApiKey: process.env.GROQ_API_KEY || null,
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};

export default config;
