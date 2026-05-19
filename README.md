# Exercise Pose Estimation API

A standalone backend service for analyzing exercise videos using MediaPipe Pose Landmarker. This service extracts pose landmarks and calculates joint angles from video frames to provide structured pose analysis data.

## Overview

This service processes uploaded exercise videos and returns:

- **Pose landmarks** for each sampled frame with normalized coordinates and confidence scores
- **Joint angles** including knee, hip, elbow, shoulder, and torso lean angles
- **Video metadata** including fps, duration, and sampling information
- **Quality metrics** to help assess pose detection reliability

### What This Service Does

✅ Video frame extraction  
✅ MediaPipe pose detection  
✅ Body joint angle calculation  
✅ Structured JSON output

### What This Service Does NOT Do

❌ Exercise grading  
❌ Feedback generation  
❌ LLM integration  
❌ Exercise interpretation  
❌ Workout planning

This service is designed to be consumed by future services that will analyze the returned pose data and provide higher-level exercise insights.

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Pose Detection**: MediaPipe Tasks Vision (Pose Landmarker)
- **Video Processing**: FFmpeg
- **Package Manager**: npm

## Installation

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- FFmpeg installed on your system

#### Install FFmpeg

**Windows:**

```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**

```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install ffmpeg
```

### Setup Steps

1. **Clone the repository**

```bash
git clone <repository-url>
cd VideoPoseEstimation
```

2. **Install dependencies**

```bash
npm install
```

3. **Create environment configuration**

```bash
cp .env.example .env
```

4. **Configure environment variables (optional)**
   Edit `.env` to customize:

```env
PORT=4000                      # Server port
FRAME_SAMPLE_INTERVAL_MS=200  # Frame sampling interval in milliseconds
MAX_VIDEO_SIZE_MB=100         # Maximum video upload size
MIN_LANDMARK_VISIBILITY=0.5   # Minimum confidence threshold for landmarks
MAX_ANALYSIS_FRAMES=180       # Cap sampled frames by increasing interval for long videos
EXTRACTED_FRAME_FORMAT=jpg    # jpg is faster/smaller than png; use png for lossless frames
EXTRACTED_FRAME_MAX_WIDTH=640 # Downscale extracted frames before MediaPipe analysis
EXTRACTED_FRAME_JPEG_QUALITY=3 # FFmpeg JPEG quality, lower is better quality
```

## Running the Service

### Development Mode

Watch mode with auto-reload:

```bash
npm run dev:watch
```

One-time run:

```bash
npm run dev
```

### Production Build

Build TypeScript to JavaScript:

```bash
npm run build
```

Run compiled server:

```bash
npm start
```

The server will start on `http://localhost:5000` (or your configured PORT).

## API Endpoints

### Health Check

```http
GET /health
```

Returns service status and MediaPipe initialization state.

**Response:**

```json
{
  "status": "ok",
  "service": "Exercise Pose Estimation API",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Health Check (Pose-specific)

```http
GET /api/pose/health
```

**Response:**

```json
{
  "status": "ok",
  "service": "Exercise Pose Estimation API",
  "mediapipeInitialized": true
}
```

### Analyze Video

```http
POST /api/pose/analyze-video
Content-Type: multipart/form-data

Field: video (binary file)
```

Analyzes an uploaded exercise video and returns pose estimation data.

#### Request Example

**Using curl:**

```bash
curl -X POST http://localhost:5000/api/pose/analyze-video \
  -F "video=@path/to/video.mp4"
```

**Using Python requests:**

```python
import requests

files = {'video': open('exercise_video.mp4', 'rb')}
response = requests.post('http://localhost:5000/api/pose/analyze-video', files=files)
print(response.json())
```

**Using Node.js/TypeScript (RECOMMENDED - with form-data package):**

```typescript
// ✅ CORRECT: Use form-data package which supports ReadStream
import FormData from "form-data";
import fs from "fs";
import axios from "axios";

const form = new FormData();
form.append("video", fs.createReadStream("exercise_video.mp4"));

const response = await axios.post(
  "http://localhost:5000/api/pose/analyze-video",
  form,
  {
    headers: form.getHeaders(),
  },
);

console.log(response.data);
```

**Using Node.js/TypeScript (Alternative - with native Fetch API):**

```typescript
// ✅ CORRECT: Convert stream to Blob for native FormData
import fs from "fs";

const fileBuffer = fs.readFileSync("exercise_video.mp4");
const blob = new Blob([fileBuffer], { type: "video/mp4" });

const form = new FormData();
form.append("video", blob, "exercise_video.mp4");

const response = await fetch("http://localhost:5000/api/pose/analyze-video", {
  method: "POST",
  body: form,
});

console.log(await response.json());
```

**❌ COMMON MISTAKE - Do NOT do this:**

```typescript
// ❌ ERROR: Native FormData does NOT accept ReadStream
const form = new FormData(); // Native FormData from Fetch API
form.append("video", fs.createReadStream("exercise_video.mp4"));
// Error: FormData.append: Expected value to be an instance of Blob
```

#### Response Example

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceModel": {
    "name": "MediaPipe Pose",
    "landmarkCount": 33
  },
  "metadata": {
    "fps": 30,
    "durationMs": 12000,
    "totalFramesInVideo": 360,
    "sampledFrameCount": 60,
    "frameSamplingRate": "every 200ms"
  },
  "quality": {
    "personDetected": true,
    "averageLandmarkConfidence": 0.94,
    "lowConfidenceFrames": [12, 18],
    "warnings": []
  },
  "frames": [
    {
      "frameIndex": 0,
      "timestampMs": 0,
      "landmarks": {
        "nose": {
          "x": 0.52,
          "y": 0.14,
          "z": -0.08,
          "visibility": 0.99
        },
        "leftShoulder": {
          "x": 0.42,
          "y": 0.28,
          "z": -0.03,
          "visibility": 0.98
        },
        "rightShoulder": {
          "x": 0.58,
          "y": 0.27,
          "z": -0.02,
          "visibility": 0.99
        },
        "leftElbow": {
          "x": 0.35,
          "y": 0.42,
          "z": -0.05,
          "visibility": 0.97
        },
        "rightElbow": {
          "x": 0.65,
          "y": 0.41,
          "z": -0.04,
          "visibility": 0.98
        },
        "leftWrist": {
          "x": 0.32,
          "y": 0.58,
          "z": -0.08,
          "visibility": 0.95
        },
        "rightWrist": {
          "x": 0.68,
          "y": 0.57,
          "z": -0.07,
          "visibility": 0.96
        },
        "leftHip": {
          "x": 0.38,
          "y": 0.52,
          "z": 0.02,
          "visibility": 0.98
        },
        "rightHip": {
          "x": 0.62,
          "y": 0.51,
          "z": 0.03,
          "visibility": 0.99
        },
        "leftKnee": {
          "x": 0.36,
          "y": 0.72,
          "z": -0.02,
          "visibility": 0.97
        },
        "rightKnee": {
          "x": 0.64,
          "y": 0.71,
          "z": -0.01,
          "visibility": 0.98
        },
        "leftAnkle": {
          "x": 0.34,
          "y": 0.92,
          "z": -0.05,
          "visibility": 0.96
        },
        "rightAnkle": {
          "x": 0.66,
          "y": 0.91,
          "z": -0.04,
          "visibility": 0.97
        }
      },
      "angles": {
        "leftKnee": {
          "value": 168.4,
          "confidence": 0.97
        },
        "rightKnee": {
          "value": 170.1,
          "confidence": 0.98
        },
        "leftHip": {
          "value": 92.3,
          "confidence": 0.96
        },
        "rightHip": {
          "value": 91.8,
          "confidence": 0.97
        },
        "leftElbow": {
          "value": 125.6,
          "confidence": 0.95
        },
        "rightElbow": {
          "value": 126.2,
          "confidence": 0.96
        },
        "leftShoulder": {
          "value": 45.3,
          "confidence": 0.96
        },
        "rightShoulder": {
          "value": 44.9,
          "confidence": 0.97
        },
        "torsoLean": {
          "value": 7.4,
          "confidence": 0.98
        }
      }
    }
  ]
}
```

#### Error Responses

**400 - Bad Request (No file):**

```json
{
  "error": "No video file provided"
}
```

**400 - Bad Request (Invalid format):**

```json
{
  "error": "Invalid video format. Allowed formats: .mp4, .mov, .avi, .mkv, .flv, .wmv, .webm, .m4v"
}
```

**400 - Bad Request (File too large):**

```json
{
  "error": "Video file exceeds maximum size of 100MB. Your file is 215.50MB"
}
```

**500 - Internal Server Error:**

```json
{
  "error": "Internal server error: Frame extraction failed"
}
```

### Analyze Video with Summary

```http
POST /api/pose/analyze-video?includeSummary=true
Content-Type: multipart/form-data

Field: video (binary file)
```

Same as Analyze Video, but also includes a movement summary in the response.

**Query Parameters:**

- `includeSummary=true` - Include movement summary metrics in response

**Response** includes all fields from basic Analyze Video, plus a `summary` field with movement metrics.

### Evaluate Exercise Form with LLM

```http
POST /api/exercise/evaluate
Content-Type: application/json
```

Generate form evaluation from the compact movement summary. This endpoint sends only the summary metrics and exercise type to the LLM, not raw frame landmarks or video.

**Request:**

```json
{
  "exerciseType": "squat",
  "movementSummary": {
    "exerciseType": "squat",
    "repMetrics": {...},
    "angleSummary": {...},
    "symmetry": {...},
    "movementConsistency": {...},
    "dataReliability": {...}
  }
}
```

**Response:**

```json
{
  "exerciseType": "squat",
  "score": 85,
  "scoreExplanation": "The movement metrics show strong knee symmetry and consistent torso lean, but a minor elbow imbalance remains.",
  "overallSummary": "The squat form appears mostly solid, with good lower-body control and some mild upper-body asymmetry.",
  "positiveFeedback": [
    "Knee angles were consistent across repetitions.",
    "Torso lean remained stable throughout the set."
  ],
  "issues": [
    {
      "title": "Upper body asymmetry",
      "severity": "medium",
      "explanation": "Right and left shoulder angles differ more than expected.",
      "suggestion": "Focus on keeping your shoulders level and your chest aligned."
    }
  ],
  "recommendations": [
    "Maintain a more even shoulder position.",
    "Continue to use the same tempo for each rep."
  ],
  "dataReliabilityNote": "Some frames had low landmark confidence, so the evaluation may be less certain."
}
```

### Analyze Video with Summary and Evaluation

```http
POST /api/pose/analyze-video?includeSummary=true&includeEvaluation=true
Content-Type: multipart/form-data

Field: video (binary file)
Field: exerciseType (string)
```

This runs the full pipeline:

- video pose analysis
- movement summary generation
- LLM-based exercise evaluation

**Response:**

```json
{
  "poseAnalysis": { ... },
  "movementSummary": { ... },
  "evaluation": { ... }
}
```

If `includeEvaluation=true`, `exerciseType` is required.

For faster evaluation responses, you can omit the large frame-by-frame landmark payload:

```http
POST /api/pose/analyze-video?includeEvaluation=true&includeFrames=false
```

You can also pass `includePoseAnalysis=false` with `includeEvaluation=true` to return only `movementSummary` and `evaluation`.

### Summarize Movement

```http
POST /api/pose/summarize
Content-Type: application/json
```

Generate movement summary metrics from existing pose analysis data without re-processing the video.

**Request:**

```json
{
  "exerciseType": "squat",
  "poseAnalysis": {
    "videoId": "...",
    "sourceModel": {...},
    "metadata": {...},
    "quality": {...},
    "frames": [...]
  }
}
```

**Response:**

```json
{
  "exerciseType": "squat",
  "repMetrics": {
    "estimatedRepCount": 5,
    "repConfidence": 0.78,
    "mainMovementAngleUsed": "leftKnee"
  },
  "angleSummary": {
    "leftKnee": {
      "avg": 92.3,
      "min": 45.2,
      "max": 170.1,
      "range": 124.9,
      "standardDeviation": 32.4,
      "validFrameCount": 55,
      "missingFrameCount": 5,
      "confidenceAvg": null
    },
    "rightKnee": {
      "avg": 91.8,
      "min": 46.1,
      "max": 169.2,
      "range": 123.1,
      "standardDeviation": 31.8,
      "validFrameCount": 56,
      "missingFrameCount": 4,
      "confidenceAvg": null
    },
    "leftHip": {...},
    "rightHip": {...},
    "leftElbow": {...},
    "rightElbow": {...},
    "leftShoulder": {...},
    "rightShoulder": {...},
    "torsoLean": {...}
  },
  "symmetry": {
    "kneeDifferenceAvg": 2.1,
    "hipDifferenceAvg": 1.8,
    "elbowDifferenceAvg": 3.2,
    "shoulderDifferenceAvg": 2.5,
    "overallSymmetryScore": 0.87
  },
  "movementConsistency": {
    "overallConsistencyScore": 0.82,
    "averageAngleVariability": 28.5,
    "torsoLeanStandardDeviation": 4.2
  },
  "dataReliability": {
    "averageLandmarkConfidence": 0.92,
    "lowConfidenceFramePercentage": 8.3,
    "missingAnglePercentage": 2.1,
    "sampledFrameCount": 60
  }
}
```

#### Request Examples

**Using curl:**

```bash
curl -X POST http://localhost:5000/api/pose/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "exerciseType": "squat",
    "poseAnalysis": {
      "videoId": "...",
      "sourceModel": {...},
      "metadata": {...},
      "quality": {...},
      "frames": [...]
    }
  }'
```

**Using Python:**

```python
import requests
import json

# First, get pose analysis from analyze-video endpoint
pose_analysis = requests.post(
    'http://localhost:5000/api/pose/analyze-video',
    files={'video': open('exercise.mp4', 'rb')}
).json()

# Then, summarize it
summary = requests.post(
    'http://localhost:5000/api/pose/summarize',
    json={
        'exerciseType': 'squat',
        'poseAnalysis': pose_analysis
    }
).json()

print(summary)
```

**Using Node.js:**

```bash
# Get summary while analyzing video
curl -X POST http://localhost:5000/api/pose/analyze-video?includeSummary=true \
  -F "video=@exercise.mp4"
```

## Understanding the Response Data

### Video Metadata

- **fps**: Frames per second of the source video
- **durationMs**: Total video duration in milliseconds
- **totalFramesInVideo**: Estimated total frames in the video
- **sampledFrameCount**: Number of frames actually analyzed
- **frameSamplingRate**: How frequently frames were sampled

### Quality Metrics

- **personDetected**: Whether a person was detected in the frames
- **averageLandmarkConfidence**: Average visibility score across all landmarks (0-1)
- **lowConfidenceFrames**: Frame indices where detection confidence was below threshold
- **warnings**: Any warnings or issues encountered during processing

### Landmarks

Each landmark contains normalized coordinates and visibility:

- **x, y**: Normalized coordinates (0-1, where 0,0 is top-left)
- **z**: Depth coordinate (negative values indicate points closer to camera)
- **visibility**: Confidence score (0-1) indicating detection quality

**Supported Landmarks:**

- Head: nose, leftEye, rightEye, leftEar, rightEar
- Torso: leftShoulder, rightShoulder, leftHip, rightHip
- Arms: leftElbow, rightElbow, leftWrist, rightWrist
- Legs: leftKnee, rightKnee, leftAnkle, rightAnkle
- Feet: leftHeel, rightHeel, leftFootIndex, rightFootIndex

### Angles

Calculated joint angles in degrees (0-180):

| Angle             | Calculation                             | Typical Range | Use Case          |
| ----------------- | --------------------------------------- | ------------- | ----------------- |
| **leftKnee**      | leftHip → leftKnee → leftAnkle          | 60-180°       | Leg straightness  |
| **rightKnee**     | rightHip → rightKnee → rightAnkle       | 60-180°       | Leg straightness  |
| **leftHip**       | leftShoulder → leftHip → leftKnee       | 80-180°       | Squat depth       |
| **rightHip**      | rightShoulder → rightHip → rightKnee    | 80-180°       | Squat depth       |
| **leftElbow**     | leftShoulder → leftElbow → leftWrist    | 0-180°        | Arm bend          |
| **rightElbow**    | rightShoulder → rightElbow → rightWrist | 0-180°        | Arm bend          |
| **leftShoulder**  | leftElbow → leftShoulder → leftHip      | 0-180°        | Shoulder angle    |
| **rightShoulder** | rightElbow → rightShoulder → rightHip   | 0-180°        | Shoulder angle    |
| **torsoLean**     | Angle between torso line and vertical   | 0-90°         | Forward/back lean |

Each angle includes:

- **value**: The calculated angle in degrees (or null if insufficient data)
- **confidence**: Average visibility of the three points forming the angle

### Movement Summary Metrics

The `/api/pose/summarize` endpoint generates objective numeric metrics from pose analysis data without any exercise-specific interpretation. These metrics are designed to be passed to a future LLM-based service for form analysis.

#### Repetition Metrics

- **estimatedRepCount**: Numeric count of detected movement cycles (e.g., squats, reps)
- **repConfidence**: Confidence score (0-1) of the repetition estimation
- **mainMovementAngleUsed**: The angle with largest range of motion used for rep estimation

The rep estimation is **generic and does not assume exercise type**. It selects the angle with the most movement and detects cycles from peaks and valleys in the smoothed timeline.

#### Angle Summary

For each tracked angle, provides statistical summary:

- **avg**: Average angle value across all valid frames
- **min/max**: Minimum and maximum angle values
- **range**: Difference between max and min
- **standardDeviation**: Measurement of angle variability/consistency
- **validFrameCount**: Number of frames where the angle was detected
- **missingFrameCount**: Number of frames where the angle was not detected
- **confidenceAvg**: Average detection confidence (currently null, reserved for future use)

#### Symmetry Metrics

Measures balance between left and right sides:

- **kneeDifferenceAvg**: Average absolute difference between left and right knee angles
- **hipDifferenceAvg**: Average absolute difference between left and right hip angles
- **elbowDifferenceAvg**: Average absolute difference between left and right elbow angles
- **shoulderDifferenceAvg**: Average absolute difference between left and right shoulder angles
- **overallSymmetryScore**: Composite score (0-1) where 1 = perfect symmetry

The symmetry score uses the formula: `symmetryScore = 1 / (1 + normalizedDifference)`, converting differences to a 0-1 scale.

#### Movement Consistency

Measures smoothness and stability of movement:

- **overallConsistencyScore**: (0-1) Higher values indicate smoother, more stable movement
- **averageAngleVariability**: Average standard deviation across all angles
- **torsoLeanStandardDeviation**: Specific variability of torso position

Consistency is calculated from angle variability: lower standard deviation = higher consistency.

#### Data Reliability

Indicates the quality and completeness of the extracted measurements:

- **averageLandmarkConfidence**: (0-1) Average confidence of MediaPipe detections
- **lowConfidenceFramePercentage**: Percentage of frames with low detection confidence
- **missingAnglePercentage**: Percentage of angles that could not be calculated
- **sampledFrameCount**: Number of frames processed from the video

These reliability metrics help determine whether the measurements are trustworthy for analysis.

#### Design Philosophy

The movement summary contains **only objective numeric metrics**. It does NOT:

- ❌ Assign grades or scores to exercise quality
- ❌ Detect "good" or "bad" form
- ❌ Make assumptions about exercise type
- ❌ Suggest corrections or improvements
- ❌ Include any interpretation of the data

This data is designed to be passed to a future service that combines it with `exerciseType` and other context to provide LLM-based interpretation and feedback.

## Configuration

### Environment Variables

```env
# Server Configuration
PORT=4000                      # Port to run the server on
NODE_ENV=development          # Environment (development/production)
GROQ_API_KEY=your_groq_api_key_here  # Groq API key for LLM evaluation
GROQ_MODEL=llama-3.1-8b-instant     # Groq model for evaluation

# Video Processing
FRAME_SAMPLE_INTERVAL_MS=200  # Milliseconds between sampled frames
MAX_ANALYSIS_FRAMES=180       # Maximum sampled frames per video; longer videos use a larger interval
EXTRACTED_FRAME_FORMAT=jpg    # jpg or png
EXTRACTED_FRAME_MAX_WIDTH=640 # Downscale extracted frames to this width before analysis
EXTRACTED_FRAME_JPEG_QUALITY=3 # FFmpeg JPEG quality, lower is better quality
MAX_VIDEO_SIZE_MB=100         # Maximum video file size in MB

# Pose Detection
MIN_LANDMARK_VISIBILITY=0.5   # Minimum confidence threshold (0-1)
MEDIAPIPE_BATCH_SIZE=48       # Number of frames sent to the browser runtime per batch
MEDIAPIPE_BROWSER_WORKERS=2   # Browser runner pages used for parallel pose detection

# File Paths
TEMP_DIR=./temp               # Temporary directory
UPLOAD_DIR=./uploads          # Upload directory
FRAME_DIR=./frames            # Frame extraction directory
```

## Project Structure

```
src/
├── app.ts                      # Express app setup
├── server.ts                   # Server entry point
├── config/
│   └── env.ts                 # Environment configuration
├── controllers/
│   └── PoseController.ts      # Request handlers
├── services/
│   ├── FrameExtractionService.ts
│   ├── MediaPipePoseEstimationService.ts
│   ├── AngleCalculationService.ts
│   └── MovementSummaryService.ts
├── routes/
│   └── pose.routes.ts         # API routes
├── models/
│   └── PoseTypes.ts           # TypeScript type definitions
└── utils/
    ├── math.ts                # Math utilities (angle calculations)
    ├── stats.ts               # Statistical utilities (for summaries)
    ├── cleanup.ts             # File cleanup utilities
    └── fileUpload.ts          # File upload validation
```

## Services

### FrameExtractionService

Extracts video frames at configurable intervals.

- Probes video for metadata (fps, duration, frame count)
- Uses FFmpeg to extract PNG frames
- Returns frame paths and timestamps

### MediaPipePoseEstimationService

Runs MediaPipe Pose Landmarker on each frame.

- Lazy initializes the model on first use
- Reuses model instance across requests
- Maps MediaPipe landmarks to our normalized format
- Calculates average visibility/confidence per frame

### AngleCalculationService

Calculates body joint angles from landmarks.

- Implements safe angle calculations with division-by-zero handling
- Validates landmark visibility before calculating angles
- Combines visibility scores into confidence ratings
- Calculates specialized angles like torso lean

### MovementSummaryService

Generates compact numeric metrics from frame-by-frame pose data.

- Extracts angle timelines from all frames
- Calculates statistics: avg, min, max, range, standard deviation
- Measures symmetry between left/right body parts
- Assesses movement consistency from angle variability
- Estimates repetition count generically (no exercise-specific logic)
- Provides data reliability metrics
- Produces JSON designed for consumption by future LLM-based services

## Error Handling

The service includes comprehensive error handling:

1. **Upload Validation**: Checks file type, size, and presence
2. **Video Validation**: Verifies video format and readability
3. **Frame Extraction**: Handles FFmpeg failures gracefully
4. **Pose Estimation**: Catches MediaPipe errors per-frame
5. **Cleanup**: Always removes temporary files on success or failure

## Troubleshooting

### MediaPipe Network Error

**Issue**: "Failed to initialize MediaPipe" with network error  
**Solution**: Ensure internet connection for downloading MediaPipe models on first run

### FFmpeg Not Found

**Issue**: "FFmpeg not found" error  
**Solution**: Install FFmpeg using the instructions in the Prerequisites section

### Frame Extraction Timeout

**Issue**: Frames aren't being extracted  
**Solution**: Check that the video file is valid and not corrupted

### Out of Memory

**Issue**: Process crashes with memory error  
**Solution**: Reduce `MAX_VIDEO_SIZE_MB` or increase Node.js heap size:

```bash
node --max-old-space-size=4096 dist/server.js
```

### FormData Error: "Expected value to be an instance of Blob"

**Issue**:

```
Error: FormData.append: Expected value (ReadStream...) to be an instance of Blob
```

**Cause**: You're using native Fetch API's `FormData` with a Node.js `ReadStream`, which is incompatible.

**Solutions**:

**Option 1 (RECOMMENDED): Use form-data package**

```javascript
import FormData from "form-data";
import fs from "fs";
import axios from "axios";

const form = new FormData();
form.append("video", fs.createReadStream("video.mp4")); // ✅ Works!

const response = await axios.post(
  "http://localhost:5000/api/pose/analyze-video",
  form,
  { headers: form.getHeaders() },
);
```

**Option 2: Convert stream to Blob with native Fetch API**

```javascript
const buffer = fs.readFileSync("video.mp4");
const blob = new Blob([buffer], { type: "video/mp4" });

const form = new FormData();
form.append("video", blob, "video.mp4"); // ✅ Works!

const response = await fetch("http://localhost:5000/api/pose/analyze-video", {
  method: "POST",
  body: form,
});
```

**❌ Don't do this:**

```javascript
// This will FAIL with "Expected Blob" error
const form = new FormData(); // Native FormData
form.append("video", fs.createReadStream("video.mp4")); // ❌ ReadStream not allowed
```

See [Request Examples](#request-example) for complete code samples.

## Architecture: Two-Layer Design

This API is structured as two independent layers that can be used separately or combined:

### Layer 1: Pose Analysis

**What it does:**

- Extracts frames from video
- Runs MediaPipe pose detection
- Calculates joint angles
- Returns frame-by-frame pose data

**Endpoint:** `POST /api/pose/analyze-video`

**Output:** `PoseAnalysisResponse`

- Frame-level landmarks and angles
- Detailed visibility/confidence per frame
- Video metadata and quality metrics

**Use Case:** When you need raw pose data with full frame-by-frame detail

### Layer 2: Movement Summary

**What it does:**

- Takes pose analysis output
- Calculates aggregate statistics
- Measures symmetry and consistency
- Estimates repetitions generically
- Produces compact metrics

**Endpoints:**

- `POST /api/pose/summarize` - Generate summary from existing analysis
- `POST /api/pose/analyze-video?includeSummary=true` - Get both layers at once

**Output:** `MovementSummaryResult`

- Numeric metrics designed for LLM interpretation
- Statistics on angles (avg, min, max, std deviation)
- Symmetry and consistency scores
- Estimated repetition count
- Data reliability metrics

**Use Case:** When you need compact metrics to pass to an LLM for exercise interpretation

### Recommended Workflow

```
User uploads video
       ↓
POST /api/pose/analyze-video?includeSummary=true
       ↓
API returns both:
  - Frame-level pose data
  - Aggregated movement metrics
       ↓
Pass movement summary + exerciseType to LLM service
       ↓
LLM service interprets form and generates feedback
```

### Data Flow

```
Video Input
    ↓
FrameExtractionService
    ├─→ Video metadata (fps, duration)
    └─→ Sampled frames (PNG files)
    ↓
MediaPipePoseEstimationService
    ├─→ Detect landmarks on each frame
    └─→ Normalize landmark coordinates
    ↓
AngleCalculationService
    ├─→ Calculate joint angles
    └─→ Assign confidence scores
    ↓
PoseAnalysisResponse (Layer 1)
    └─→ Frame-by-frame data
    ↓
MovementSummaryService (Layer 2)
    ├─→ Extract angle timelines
    ├─→ Calculate statistics
    ├─→ Measure symmetry
    ├─→ Assess consistency
    ├─→ Estimate repetitions
    └─→ Evaluate reliability
    ↓
MovementSummaryResult
    └─→ Compact numeric metrics
```

## Performance Considerations

- **Frame Sampling**: The default 200ms interval extracts ~5 fps from 30fps video. Adjust for accuracy vs speed
- **Memory**: Large videos will consume more memory. Temporary files are cleaned up after processing
- **MediaPipe Model**: Loaded once on first request, reused across all subsequent requests
- **Concurrent Requests**: Currently processes one video at a time. Each upload creates temporary resources

## Future Enhancements

Potential additions for future phases:

- Batch frame processing for improved performance
- Support for multiple people in frame
- Custom landmark filters and output formats
- Real-time WebSocket streaming of results
- GPU acceleration support
- Caching layer for repeated analyses

## License

MIT

## Support

For issues or questions:

1. Check the Troubleshooting section
2. Review environment configuration
3. Check server logs for error messages
4. Ensure all prerequisites are installed

---

**Service Version**: 1.0.0  
**MediaPipe Tasks Vision**: 0.10.9  
**Node.js Minimum**: 18.0.0
