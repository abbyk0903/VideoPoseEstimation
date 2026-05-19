/**
 * FrameExtractionService - Extract frames from video files
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { ensureDirectoryExists } from '../utils/cleanup';

const ffprobeStatic: { path?: string } = require('ffprobe-static');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

if (ffprobeStatic?.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export interface VideoInfo {
  fps: number;
  duration: number;
  durationMs: number;
  totalFramesEstimated: number;
}

export interface FrameExtractionOptions {
  sampleIntervalMs: number;
  outputDir: string;
  frameFormat?: 'jpg' | 'png';
  maxWidth?: number;
  jpegQuality?: number;
  videoInfo?: VideoInfo;
}

export interface ExtractedFrame {
  frameIndex: number;
  frameNumber: number;
  timestampMs: number;
  framePath: string;
  mimeType: string;
}

export class FrameExtractionService {
  private static parseFps(rate?: string): number {
    if (!rate) {
      return 30;
    }

    const [numerator, denominator] = rate.split('/').map(Number);
    if (!Number.isFinite(numerator) || numerator <= 0) {
      return 30;
    }

    if (!Number.isFinite(denominator) || denominator <= 0) {
      return numerator;
    }

    return numerator / denominator;
  }

  /**
   * Get video metadata (fps, duration, frame count)
   */
  static async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe video: ${err.message}`));
          return;
        }

        try {
          const stream = metadata.streams.find((s) => s.codec_type === 'video');
          if (!stream) {
            throw new Error('No video stream found');
          }

          const fps = this.parseFps(stream.r_frame_rate);
          const duration = metadata.format.duration || 0;
          const durationMs = Math.round(duration * 1000);
          const totalFramesEstimated = Math.round(duration * fps);

          resolve({
            fps,
            duration,
            durationMs,
            totalFramesEstimated,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Extract frames from video at specified intervals
   */
  static async extractFrames(
    videoPath: string,
    options: FrameExtractionOptions
  ): Promise<ExtractedFrame[]> {
    await ensureDirectoryExists(options.outputDir);

    const videoInfo = options.videoInfo || await this.getVideoInfo(videoPath);
    const frameFormat = options.frameFormat || 'jpg';
    const outputPattern = path.join(options.outputDir, `frame_%06d.${frameFormat}`);
    const frameRate = 1000 / options.sampleIntervalMs;
    const filters = [`fps=${frameRate}`];
    if (options.maxWidth && options.maxWidth > 0) {
      filters.push(`scale='min(${options.maxWidth},iw)':-2`);
    }

    const outputOptions = [
      '-vf',
      filters.join(','),
      '-start_number',
      '0',
    ];

    if (frameFormat === 'jpg') {
      outputOptions.push('-q:v', String(options.jpegQuality || 3));
    }

    return new Promise((resolve, reject) => {
      const stderrLines: string[] = [];

      ffmpeg(videoPath)
        .outputOptions(outputOptions)
        .output(outputPattern)
        .on('stderr', (line) => {
          stderrLines.push(line);
        })
        .on('end', () => {
          try {
            const files = fs.readdirSync(options.outputDir)
              .filter((f) => f.startsWith('frame_') && f.endsWith(`.${frameFormat}`))
              .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                return numA - numB;
              });

            const extractedFrames = files.map((filename, index) => {
              const framePath = path.join(options.outputDir, filename);
              const timestampMs = Math.min(index * options.sampleIntervalMs, videoInfo.durationMs);
              return {
                frameIndex: index,
                frameNumber: index,
                timestampMs,
                framePath,
                mimeType: frameFormat === 'jpg' ? 'image/jpeg' : 'image/png',
              };
            });

            resolve(extractedFrames);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            reject(new Error(`Frame extraction failed while reading extracted frames: ${message}`));
          }
        })
        .on('error', (err) => {
          const stderr = stderrLines.slice(-20).join('\n').trim();
          const details = stderr ? `${err.message}\n${stderr}` : err.message;
          reject(new Error(`Frame extraction failed: ${details}`));
        })
        .run();
    });
  }
}
