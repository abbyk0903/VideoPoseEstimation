/**
 * Test the LLM exercise form evaluation endpoint without uploading a video.
 *
 * Usage:
 *   npm run test:evaluation
 *   API_URL=http://localhost:4000 EXERCISE_TYPE=squat npm run test:evaluation
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000'
const exerciseType = process.env.EXERCISE_TYPE || 'squat'

const movementSummary = {
  exerciseType,
  repMetrics: {
    estimatedRepCount: 5,
    repConfidence: 0.82,
    mainMovementAngleUsed: 'leftKnee'
  },
  angleSummary: {
    leftKnee: {
      avg: 104.2,
      min: 63.1,
      max: 171.4,
      range: 108.3,
      standardDeviation: 28.4,
      validFrameCount: 60,
      missingFrameCount: 0,
      confidenceAvg: 0.93
    },
    rightKnee: {
      avg: 107.1,
      min: 66.2,
      max: 172.0,
      range: 105.8,
      standardDeviation: 27.9,
      validFrameCount: 60,
      missingFrameCount: 0,
      confidenceAvg: 0.92
    },
    leftHip: {
      avg: 98.6,
      min: 70.1,
      max: 151.2,
      range: 81.1,
      standardDeviation: 20.5,
      validFrameCount: 58,
      missingFrameCount: 2,
      confidenceAvg: 0.91
    },
    rightHip: {
      avg: 101.8,
      min: 73.0,
      max: 153.5,
      range: 80.5,
      standardDeviation: 21.3,
      validFrameCount: 58,
      missingFrameCount: 2,
      confidenceAvg: 0.91
    },
    torsoLean: {
      avg: 12.3,
      min: 7.4,
      max: 22.9,
      range: 15.5,
      standardDeviation: 4.1,
      validFrameCount: 60,
      missingFrameCount: 0,
      confidenceAvg: 0.94
    }
  },
  symmetry: {
    kneeDifferenceAvg: 3.2,
    hipDifferenceAvg: 3.7,
    elbowDifferenceAvg: null,
    shoulderDifferenceAvg: null,
    overallSymmetryScore: 0.88
  },
  movementConsistency: {
    overallConsistencyScore: 0.79,
    averageAngleVariability: 20.4,
    torsoLeanStandardDeviation: 4.1
  },
  dataReliability: {
    averageLandmarkConfidence: 0.92,
    lowConfidenceFramePercentage: 3.3,
    missingAnglePercentage: 1.8,
    sampledFrameCount: 60
  }
}

async function main() {
  const response = await fetch(`${API_BASE_URL}/api/exercise/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseType, movementSummary })
  })

  const text = await response.text()
  console.log('status', response.status)
  console.log(text)

  if (!response.ok) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
