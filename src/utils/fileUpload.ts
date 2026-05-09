/**
 * File upload utilities
 */

import path from 'path';
import { UploadedFile } from 'express-fileupload';

const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v'];

/**
 * Validate if the uploaded file is a supported video format
 */
export function isValidVideoFile(file: UploadedFile): boolean {
  const ext = path.extname(file.name).toLowerCase();
  return ALLOWED_VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Get file size in MB
 */
export function getFileSizeMB(file: UploadedFile): number {
  return file.size / (1024 * 1024);
}

/**
 * Validate file size
 */
export function isValidFileSize(file: UploadedFile, maxSizeMB: number): boolean {
  return getFileSizeMB(file) <= maxSizeMB;
}

/**
 * Validate uploaded video file
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateVideoUpload(
  file: UploadedFile | undefined,
  maxSizeMB: number
): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No video file provided' };
  }

  if (!isValidVideoFile(file)) {
    return {
      valid: false,
      error: `Invalid video format. Allowed formats: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`,
    };
  }

  if (!isValidFileSize(file, maxSizeMB)) {
    return {
      valid: false,
      error: `Video file exceeds maximum size of ${maxSizeMB}MB. Your file is ${getFileSizeMB(file).toFixed(2)}MB`,
    };
  }

  return { valid: true };
}

/**
 * Generate a unique filename for uploaded video
 */
export function generateVideoFilename(originalName: string, prefix: string = 'video'): string {
  const timestamp = Date.now();
  const ext = path.extname(originalName);
  return `${prefix}_${timestamp}${ext}`;
}
