/**
 * FrameExtractionService - Extract frames from video files
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { ensureDirectoryExists, removeDirectory } from '../utils/cleanup';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
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
}

export interface ExtractedFrame {
  frameIndex: number;
  frameNumber: number;
  timestampMs: number;
  framePath: string;
}

export class FrameExtractionService {
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

          const fps = stream.r_frame_rate ? eval(stream.r_frame_rate) : 30;
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

    const videoInfo = await this.getVideoInfo(videoPath);
    const frameDurationMs = 1000 / videoInfo.fps;
    const frameInterval = Math.max(1, Math.round(options.sampleIntervalMs / frameDurationMs));

    return new Promise((resolve, reject) => {
      let frameCount = 0;
      let extractedFrames: ExtractedFrame[] = [];

      ffmpeg(videoPath)
        .on('filenames', (filenames) => {
          // Not used in this case, we handle frame numbering
        })
        .on('end', () => {
          resolve(extractedFrames);
        })
        .on('error', (err) => {
          reject(new Error(`Frame extraction failed: ${err.message}`));
        })
        .screenshots({
          count: Math.ceil(videoInfo.durationMs / options.sampleIntervalMs),
          folder: options.outputDir,
          filename: 'frame_%i.png',
          timestamps: this.generateTimestamps(videoInfo.durationMs, options.sampleIntervalMs),
        });

      // Track extracted frames
      const trackFrames = () => {
        try {
          const files = fs.readdirSync(options.outputDir)
            .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
            .sort((a, b) => {
              const numA = parseInt(a.match(/\d+/)?.[0] || '0');
              const numB = parseInt(b.match(/\d+/)?.[0] || '0');
              return numA - numB;
            });

          extractedFrames = files.map((filename, index) => {
            const framePath = path.join(options.outputDir, filename);
            const timestampMs = index * options.sampleIntervalMs;
            return {
              frameIndex: index,
              frameNumber: index,
              timestampMs,
              framePath,
            };
          });
        } catch (error) {
          console.error('Error tracking frames:', error);
        }
      };

      // Check for frames periodically
      const checkInterval = setInterval(() => {
        trackFrames();
        if (extractedFrames.length > frameCount) {
          frameCount = extractedFrames.length;
        }
      }, 500);

      // Clean up interval on completion
      setTimeout(() => {
        clearInterval(checkInterval);
      }, videoInfo.durationMs + 5000);
    });
  }

  /**
   * Generate timestamps for frame extraction (in seconds)
   */
  private static generateTimestamps(durationMs: number, intervalMs: number): number[] {
    const timestamps: number[] = [];
    const durationSec = durationMs / 1000;
    const intervalSec = intervalMs / 1000;

    for (let i = 0; i < durationSec; i += intervalSec) {
      timestamps.push(i);
    }

    return timestamps;
  }
}
