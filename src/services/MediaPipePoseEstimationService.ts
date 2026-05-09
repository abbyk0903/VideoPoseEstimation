/**
 * MediaPipePoseEstimationService - Run pose estimation on frames.
 *
 * @mediapipe/tasks-vision is browser-first and needs a real WebGL runtime when
 * converting image frames. The Node API keeps the rest of the service simple,
 * but actual pose inference runs in a reusable headless Chrome page.
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Landmark, LandmarkName, FrameData } from '../models/PoseTypes';
import { calculateAverageVisibility } from '../utils/math';

// Map from MediaPipe landmark indices to names. Non-tracked indices are null.
const LANDMARK_NAMES: Array<LandmarkName | null> = [
  'nose', // 0
  null, // 1 leftEyeInner
  'leftEye', // 2
  null, // 3 leftEyeOuter
  null, // 4 rightEyeInner
  'rightEye', // 5
  null, // 6 rightEyeOuter
  'leftEar', // 7
  'rightEar', // 8
  null, // 9 mouthLeft
  null, // 10 mouthRight
  'leftShoulder', // 11
  'rightShoulder', // 12
  'leftElbow', // 13
  'rightElbow', // 14
  'leftWrist', // 15
  'rightWrist', // 16
  null, // 17 leftPinky
  null, // 18 rightPinky
  null, // 19 leftIndex
  null, // 20 rightIndex
  null, // 21 leftThumb
  null, // 22 rightThumb
  'leftHip', // 23
  'rightHip', // 24
  'leftKnee', // 25
  'rightKnee', // 26
  'leftAnkle', // 27
  'rightAnkle', // 28
  'leftHeel', // 29
  'rightHeel', // 30
  'leftFootIndex', // 31
  'rightFootIndex', // 32
];

type BrowserLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseFrameInput = {
  framePath: string;
  frameIndex: number;
  timestampMs: number;
};

type CdpResponse = {
  id?: number;
  result?: any;
  error?: { message: string; data?: string };
  method?: string;
  params?: any;
};

class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private eventWaiters = new Map<string, Array<(params: any) => void>>();

  async connect(webSocketUrl: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(webSocketUrl);
      this.ws = ws;

      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('Failed to connect to Chrome DevTools')), { once: true });
      ws.addEventListener('message', (event) => this.handleMessage(event.data));
      ws.addEventListener('close', () => {
        for (const { reject } of this.pending.values()) {
          reject(new Error('Chrome DevTools connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Chrome DevTools is not connected'));
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.ws.send(message);
    return promise;
  }

  waitForEvent(method: string, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter !== finish));
        reject(new Error(`Timed out waiting for Chrome event ${method}`));
      }, timeoutMs);

      const finish = (params: any) => {
        clearTimeout(timer);
        resolve(params);
      };

      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(finish);
      this.eventWaiters.set(method, waiters);
    });
  }

  async evaluate(expression: string): Promise<any> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const message = details.exception?.description || details.text || 'Browser evaluation failed';
      throw new Error(message);
    }

    return result.result?.value;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(data: unknown): void {
    const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8');
    const message = JSON.parse(text) as CdpResponse;

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.data || message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const waiters = this.eventWaiters.get(message.method) || [];
      this.eventWaiters.delete(message.method);
      waiters.forEach((waiter) => waiter(message.params));
    }
  }
}

class BrowserPoseRuntime {
  private static readonly defaultModelUrl =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  private chrome: ChildProcessWithoutNullStreams | null = null;
  private clients: CdpClient[] = [];
  private server: http.Server | null = null;
  private serverPort = 0;
  private chromeDebugPort = 0;
  private chromeUserDataDir = '';
  private readonly frameFiles = new Map<string, string>();
  private readonly workerCount = this.getWorkerCount();

  async start(): Promise<void> {
    this.serverPort = await this.getFreePort();
    this.chromeDebugPort = await this.getFreePort();
    this.chromeUserDataDir = path.join(os.tmpdir(), `mediapipe-chrome-${randomUUID()}`);

    await this.startServer();
    await this.startChrome();
    await this.openRunnerPages();
  }

  async detectBatch(imagePaths: string[]): Promise<BrowserLandmark[][]> {
    if (this.clients.length === 0) {
      throw new Error('Browser pose runtime is not initialized');
    }

    if (imagePaths.length === 0) {
      return [];
    }

    const frames = imagePaths.map((imagePath) => {
      const frameId = randomUUID();
      this.frameFiles.set(frameId, path.resolve(imagePath));
      return {
        frameId,
        frameUrl: `http://127.0.0.1:${this.serverPort}/frame/${frameId}`,
      };
    });

    try {
      const chunks = this.splitIntoChunks(frames, this.clients.length);
      const results = await Promise.all(chunks.map((chunk, index) => {
        if (chunk.length === 0) {
          return Promise.resolve([] as BrowserLandmark[][]);
        }

        const urls = chunk.map((frame) => frame.frameUrl);
        return this.clients[index].evaluate(`window.poseRuntime.detectBatch(${JSON.stringify(urls)})`) as Promise<BrowserLandmark[][]>;
      }));

      return results.flat();
    } finally {
      frames.forEach((frame) => this.frameFiles.delete(frame.frameId));
    }
  }

  async stop(): Promise<void> {
    this.clients.forEach((client) => client.close());
    this.clients = [];

    if (this.chrome) {
      this.chrome.kill();
      this.chrome = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }

    if (this.chromeUserDataDir) {
      fs.rm(this.chromeUserDataDir, { recursive: true, force: true }, () => undefined);
      this.chromeUserDataDir = '';
    }
  }

  private async startServer(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.serverPort, '127.0.0.1', () => resolve());
    });
  }

  private async startChrome(): Promise<void> {
    const chromePath = this.getChromePath();
    const runnerUrl = `http://127.0.0.1:${this.serverPort}/runner`;

    this.chrome = spawn(chromePath, [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-extensions',
      '--disable-sync',
      '--disable-features=MediaRouter,OptimizationHints,PushMessaging',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--remote-debugging-port=${this.chromeDebugPort}`,
      `--user-data-dir=${this.chromeUserDataDir}`,
      runnerUrl,
    ], {
      windowsHide: true,
    });

    this.chrome.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (this.shouldLogChromeStderr(text)) {
        console.warn(text.trim());
      }
    });

    await this.waitForChrome();
  }

  private async openRunnerPages(): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: this.workerCount }, () => this.openRunnerPage())
    );

    const modelPath = process.env.MEDIAPIPE_POSE_MODEL_PATH?.trim();
    const modelUrl = modelPath
      ? `http://127.0.0.1:${this.serverPort}/model`
      : BrowserPoseRuntime.defaultModelUrl;

    await Promise.all(clients.map((client) => client.evaluate(`window.poseRuntime.initialize({
      wasmBaseUrl: ${JSON.stringify(`http://127.0.0.1:${this.serverPort}/wasm`)},
      modelUrl: ${JSON.stringify(modelUrl)}
    })`)));

    this.clients = clients;
  }

  private async openRunnerPage(): Promise<CdpClient> {
    const target = await this.createChromeTarget(`http://127.0.0.1:${this.serverPort}/runner`);
    const cdp = new CdpClient();
    await cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const loadEvent = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${this.serverPort}/runner` });
    await loadEvent;

    await this.waitForPoseRuntime(cdp);
    return cdp;
  }

  private async waitForPoseRuntime(cdp: CdpClient): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      const ready = await cdp.evaluate('Boolean(window.poseRuntime)');
      if (ready) {
        return;
      }
      await this.delay(250);
    }

    throw new Error('Timed out waiting for MediaPipe browser runner');
  }

  private async createChromeTarget(url: string): Promise<{ webSocketDebuggerUrl: string }> {
    const endpoint = `http://127.0.0.1:${this.chromeDebugPort}/json/new?${encodeURIComponent(url)}`;
    let response = await fetch(endpoint, { method: 'PUT' });
    if (!response.ok) {
      response = await fetch(endpoint);
    }

    if (!response.ok) {
      throw new Error(`Failed to create Chrome target: ${response.status} ${await response.text()}`);
    }

    return response.json() as Promise<{ webSocketDebuggerUrl: string }>;
  }

  private async waitForChrome(): Promise<void> {
    const endpoint = `http://127.0.0.1:${this.chromeDebugPort}/json/version`;
    const started = Date.now();

    while (Date.now() - started < 15000) {
      if (this.chrome?.exitCode !== null) {
        throw new Error(`Chrome exited before DevTools became available with code ${this.chrome?.exitCode}`);
      }

      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          return;
        }
      } catch {
        // Chrome is still starting.
      }

      await this.delay(250);
    }

    throw new Error('Timed out waiting for Chrome DevTools');
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.serverPort}`);

    try {
      if (url.pathname === '/runner') {
        this.sendText(res, 'text/html', this.getRunnerHtml());
        return;
      }

      if (url.pathname === '/vision_bundle.mjs') {
        this.sendFile(res, path.join(path.dirname(require.resolve('@mediapipe/tasks-vision')), 'vision_bundle.mjs'), 'text/javascript');
        return;
      }

      if (url.pathname.startsWith('/wasm/')) {
        const filename = path.basename(url.pathname);
        this.sendFile(
          res,
          path.join(path.dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm', filename),
          filename.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
        );
        return;
      }

      if (url.pathname === '/model') {
        const modelPath = process.env.MEDIAPIPE_POSE_MODEL_PATH?.trim();
        if (!modelPath) {
          this.notFound(res);
          return;
        }
        this.sendFile(res, path.resolve(modelPath), 'application/octet-stream');
        return;
      }

      if (url.pathname.startsWith('/frame/')) {
        const frameId = path.basename(url.pathname);
        const framePath = this.frameFiles.get(frameId);
        if (!framePath) {
          this.notFound(res);
          return;
        }
        this.sendFile(res, framePath, 'image/png');
        return;
      }

      this.notFound(res);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(error instanceof Error ? error.message : String(error));
    }
  }

  private getRunnerHtml(): string {
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>MediaPipe Pose Runner</title></head>
<body>
<script type="module">
import { FilesetResolver, PoseLandmarker } from '/vision_bundle.mjs';

let poseLandmarker = null;

window.importScripts = () => {
  throw new TypeError('Use dynamic import for MediaPipe WASM modules');
};
window.import = async (moduleUrl) => {
  const wasmModule = await import(moduleUrl);
  window.ModuleFactory = wasmModule.default || wasmModule;
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load frame image'));
    image.src = url;
  });
}

window.poseRuntime = {
  async initialize(config) {
    const vision = await FilesetResolver.forVisionTasks(config.wasmBaseUrl, true);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: config.modelUrl,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
    });
    return true;
  },

  async detect(frameUrl) {
    if (!poseLandmarker) {
      throw new Error('Pose landmarker is not initialized');
    }
    const image = await loadImage(frameUrl);
    const result = poseLandmarker.detect(image);
    return result.landmarks?.[0] || [];
  },

  async detectBatch(frameUrls) {
    const results = [];
    for (const frameUrl of frameUrls) {
      results.push(await this.detect(frameUrl));
    }
    return results;
  },
};
</script>
</body>
</html>`;
  }

  private sendFile(res: http.ServerResponse, filePath: string, contentType: string): void {
    if (!fs.existsSync(filePath)) {
      this.notFound(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  }

  private sendText(res: http.ServerResponse, contentType: string, text: string): void {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(text);
  }

  private notFound(res: http.ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  private getChromePath(): string {
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean) as string[];

    const chromePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!chromePath) {
      throw new Error('Chrome or Edge was not found. Set CHROME_PATH to a Chromium-based browser executable.');
    }

    return chromePath;
  }

  private shouldLogChromeStderr(text: string): boolean {
    const ignoredPatterns = [
      'google_apis\\gcm',
      'PHONE_REGISTRATION_ERROR',
      'DEPRECATED_ENDPOINT',
      'Authentication Failed: wrong_secret',
      'Failed to log in to GCM',
    ];

    return text.toLowerCase().includes('error') &&
      !ignoredPatterns.some((pattern) => text.includes(pattern));
  }

  private getWorkerCount(): number {
    const rawValue = Number(process.env.MEDIAPIPE_BROWSER_WORKERS || 2);
    if (!Number.isFinite(rawValue) || rawValue < 1) {
      return 2;
    }

    return Math.min(Math.floor(rawValue), 4);
  }

  private splitIntoChunks<T>(items: T[], chunkCount: number): T[][] {
    const size = Math.ceil(items.length / chunkCount);
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    while (chunks.length < chunkCount) {
      chunks.push([]);
    }

    return chunks;
  }

  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(port));
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class MediaPipePoseEstimationService {
  private static runtime: BrowserPoseRuntime | null = null;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize the MediaPipe pose model (singleton pattern)
   */
  static async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeRuntime();
    return this.initPromise;
  }

  /**
   * Estimate pose from a frame image
   */
  static async estimatePose(
    imagePath: string,
    frameIndex: number,
    timestampMs: number
  ): Promise<FrameData> {
    if (!this.runtime) {
      throw new Error('MediaPipe not initialized. Call initialize() first.');
    }

    try {
      const [landmarkList] = await this.runtime.detectBatch([imagePath]);
      return this.toFrameData({
        framePath: imagePath,
        frameIndex,
        timestampMs,
      }, landmarkList || []);
    } catch (error) {
      console.error(`Failed to estimate pose for frame ${frameIndex}:`, error);
      return {
        frameIndex,
        timestampMs,
        landmarks: {},
        angles: {},
      };
    }
  }

  static async estimatePoses(frames: PoseFrameInput[]): Promise<FrameData[]> {
    if (!this.runtime) {
      throw new Error('MediaPipe not initialized. Call initialize() first.');
    }

    if (frames.length === 0) {
      return [];
    }

    try {
      const landmarkLists = await this.runtime.detectBatch(frames.map((frame) => frame.framePath));
      return frames.map((frame, index) => this.toFrameData(frame, landmarkLists[index] || []));
    } catch (error) {
      console.error('Failed to estimate poses for frame batch:', error);
      return frames.map((frame) => ({
        frameIndex: frame.frameIndex,
        timestampMs: frame.timestampMs,
        landmarks: {},
        angles: {},
      }));
    }
  }

  /**
   * Cleanup resources
   */
  static async cleanup(): Promise<void> {
    await this.runtime?.stop();
    this.runtime = null;
    this.initPromise = null;
  }

  /**
   * Check if initialized
   */
  static isInitialized(): boolean {
    return this.runtime !== null;
  }

  private static async initializeRuntime(): Promise<void> {
    try {
      if (this.runtime) {
        return;
      }

      const runtime = new BrowserPoseRuntime();
      await runtime.start();
      this.runtime = runtime;

      console.log('MediaPipe Pose Landmarker initialized successfully in headless Chrome');
    } catch (error) {
      this.initPromise = null;
      await this.runtime?.stop();
      this.runtime = null;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize MediaPipe browser runtime: ${message}`);
    }
  }

  private static toFrameData(frame: PoseFrameInput, landmarkList: BrowserLandmark[]): FrameData {
    const landmarks: Partial<Record<LandmarkName, Landmark>> = {};
    const visibilities: number[] = [];

    landmarkList.forEach((landmark, index) => {
      const name = LANDMARK_NAMES[index];

      if (!name) {
        return;
      }

      landmarks[name] = {
        x: landmark.x,
        y: landmark.y,
        z: landmark.z || 0,
        visibility: landmark.visibility || 0,
      };
      visibilities.push(landmark.visibility || 0);
    });

    calculateAverageVisibility(visibilities);

    return {
      frameIndex: frame.frameIndex,
      timestampMs: frame.timestampMs,
      landmarks,
      angles: {},
    };
  }
}
