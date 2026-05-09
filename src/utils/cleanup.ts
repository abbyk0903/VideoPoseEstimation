/**
 * File cleanup utilities
 */

import fs from 'fs';
import path from 'path';

/**
 * Remove a file if it exists
 */
export function removeFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Failed to remove file ${filePath}:`, err);
      }
      resolve();
    });
  });
}

/**
 * Remove a directory and all its contents
 */
export function removeDirectory(dirPath: string): Promise<void> {
  return new Promise((resolve) => {
    fs.rm(dirPath, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error(`Failed to remove directory ${dirPath}:`, err);
      }
      resolve();
    });
  });
}

/**
 * Remove multiple files
 */
export async function removeFiles(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((fp) => removeFile(fp)));
}

/**
 * Create directory if it doesn't exist
 */
export function ensureDirectoryExists(dirPath: string): Promise<void> {
  return new Promise((resolve) => {
    fs.mkdir(dirPath, { recursive: true }, (err) => {
      if (err && err.code !== 'EEXIST') {
        console.error(`Failed to create directory ${dirPath}:`, err);
      }
      resolve();
    });
  });
}

/**
 * Get all files in a directory
 */
export async function getFilesInDirectory(dirPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        resolve([]);
      } else {
        resolve(files.map((f) => path.join(dirPath, f)));
      }
    });
  });
}
