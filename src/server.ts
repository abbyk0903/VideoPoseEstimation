/**
 * Server initialization
 */

import { createApp } from './app';
import { config } from './config/env';
import { ensureDirectoryExists } from './utils/cleanup';

async function startServer() {
  try {
    // Ensure temp directories exist
    await ensureDirectoryExists(config.uploadDir);
    await ensureDirectoryExists(config.frameDir);
    await ensureDirectoryExists(config.tempDir);

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║  Exercise Pose Estimation API                            ║
║  Server running on http://localhost:${config.port}              ║
║  Environment: ${config.nodeEnv}                              ║
║  Frame sampling interval: ${config.frameSampleIntervalMs}ms       ║
║  Min landmark visibility: ${config.minLandmarkVisibility}        ║
╚════════════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
