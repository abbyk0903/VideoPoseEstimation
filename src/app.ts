/**
 * Express app configuration
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import fileUpload from 'express-fileupload';
import poseRoutes from './routes/pose.routes';
import exerciseRoutes from './routes/exercise.routes';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // File upload middleware
  app.use(
    fileUpload({
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
      useTempFiles: false,
      safeFileNames: true,
      preserveExtension: true,
    })
  );

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/api/pose', poseRoutes);
  app.use('/api/exercise', exerciseRoutes);

  // Health check root endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'Exercise Pose Estimation API',
      timestamp: new Date().toISOString(),
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

export default createApp;
