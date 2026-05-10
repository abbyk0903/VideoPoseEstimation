/**
 * Sample cases for camera-aware movement summaries.
 *
 * Usage:
 *   npm run test:camera-view
 */

const assert = require('assert')
const { MovementSummaryService } = require('./src/services/MovementSummaryService')

function landmark(x, y, visibility) {
  return { x, y, z: 0, visibility }
}

function makeFrame(frameIndex, options) {
  const leftVisibility = options.leftVisibility
  const rightVisibility = options.rightVisibility
  const width = options.width
  const kneeAngle = options.kneeAngle ?? 85
  const hipAngle = options.hipAngle ?? 95
  const torsoLean = options.torsoLean ?? 18
  const leftX = 0.5 - width / 2
  const rightX = 0.5 + width / 2

  return {
    frameIndex,
    timestampMs: frameIndex * 200,
    landmarks: {
      leftShoulder: landmark(leftX, 0.2, leftVisibility),
      rightShoulder: landmark(rightX, 0.2, rightVisibility),
      leftHip: landmark(leftX, 0.45, leftVisibility),
      rightHip: landmark(rightX, 0.45, rightVisibility),
      leftKnee: landmark(leftX + 0.02, 0.68, leftVisibility),
      rightKnee: landmark(rightX - 0.02, 0.68, rightVisibility),
      leftAnkle: landmark(leftX, 0.9, leftVisibility),
      rightAnkle: landmark(rightX, 0.9, rightVisibility),
      leftHeel: landmark(leftX - 0.01, 0.92, leftVisibility),
      rightHeel: landmark(rightX + 0.01, 0.92, rightVisibility),
      leftFootIndex: landmark(leftX + 0.04, 0.92, leftVisibility),
      rightFootIndex: landmark(rightX - 0.04, 0.92, rightVisibility)
    },
    angles: {
      leftKnee: leftVisibility >= 0.5 ? { value: kneeAngle, confidence: leftVisibility } : { value: null, confidence: null },
      rightKnee: rightVisibility >= 0.5 ? { value: kneeAngle + 2, confidence: rightVisibility } : { value: null, confidence: null },
      leftHip: leftVisibility >= 0.5 ? { value: hipAngle, confidence: leftVisibility } : { value: null, confidence: null },
      rightHip: rightVisibility >= 0.5 ? { value: hipAngle + 2, confidence: rightVisibility } : { value: null, confidence: null },
      torsoLean: { value: torsoLean, confidence: Math.max(leftVisibility, rightVisibility) }
    }
  }
}

function summarize(frames) {
  return MovementSummaryService.summarize({
    videoId: 'sample',
    sourceModel: { name: 'test', landmarkCount: 33 },
    metadata: { fps: 25, durationMs: 1000, totalFramesInVideo: 25, sampledFrameCount: frames.length, frameSamplingRate: 'test' },
    quality: { personDetected: true, averageLandmarkConfidence: 0.9, lowConfidenceFrames: [], warnings: [] },
    frames
  }, 'squat')
}

const sideView = summarize(Array.from({ length: 5 }, (_, index) =>
  makeFrame(index, { leftVisibility: 0.9, rightVisibility: 0.2, width: 0.04 })
))
assert.strictEqual(sideView.cameraContext.cameraView, 'SIDE_VIEW')
assert.strictEqual(sideView.cameraContext.reliableSide, 'LEFT')
assert.strictEqual(sideView.cameraContext.symmetryAvailable, false)
assert(sideView.cameraContext.ignoredMetrics.includes('leftRightSymmetry'))
assert.strictEqual(sideView.scoringContext.metrics.leftRightSymmetry.usableForScoring, false)
assert.strictEqual(sideView.symmetry.overallSymmetryScore, null)

const frontView = summarize(Array.from({ length: 5 }, (_, index) =>
  makeFrame(index, { leftVisibility: 0.9, rightVisibility: 0.88, width: 0.18 })
))
assert.strictEqual(frontView.cameraContext.cameraView, 'FRONT_VIEW')
assert(frontView.cameraContext.cameraViewConfidence >= 0.8)
assert.strictEqual(frontView.cameraContext.reliableSide, 'BOTH')
assert.strictEqual(frontView.cameraContext.symmetryAvailable, true)
assert(!frontView.cameraContext.ignoredMetrics.includes('leftRightSymmetry'))
assert.strictEqual(frontView.scoringContext.metrics.leftRightSymmetry.usableForScoring, true)
assert.notStrictEqual(frontView.symmetry.overallSymmetryScore, null)

const lowQuality = summarize(Array.from({ length: 5 }, (_, index) =>
  makeFrame(index, { leftVisibility: 0.25, rightVisibility: 0.2, width: 0.18 })
))
assert.strictEqual(lowQuality.cameraContext.cameraView, 'UNKNOWN')
assert.strictEqual(lowQuality.cameraContext.reliableSide, 'UNKNOWN')
assert.strictEqual(lowQuality.cameraContext.symmetryAvailable, false)
assert(lowQuality.cameraContext.ignoredMetrics.includes('leftRightSymmetry'))
assert.strictEqual(lowQuality.scoringContext.metrics.rangeOfMotion.usableForScoring, false)
assert(lowQuality.cameraContext.ignoredReasons.includes('No body side is reliable enough for side-specific scoring'))

const nonSymmetryExercise = MovementSummaryService.summarize({
  videoId: 'sample',
  sourceModel: { name: 'test', landmarkCount: 33 },
  metadata: { fps: 25, durationMs: 1000, totalFramesInVideo: 25, sampledFrameCount: 5, frameSamplingRate: 'test' },
  quality: { personDetected: true, averageLandmarkConfidence: 0.9, lowConfidenceFrames: [], warnings: [] },
  frames: Array.from({ length: 5 }, (_, index) =>
    makeFrame(index, { leftVisibility: 0.9, rightVisibility: 0.88, width: 0.18 })
  )
}, 'lunge')
assert.strictEqual(nonSymmetryExercise.cameraContext.cameraView, 'FRONT_VIEW')
assert.strictEqual(nonSymmetryExercise.cameraContext.symmetryAvailable, false)
assert(nonSymmetryExercise.cameraContext.ignoredMetrics.includes('leftRightSymmetry'))

const deepControlled = MovementSummaryService.summarize({
  videoId: 'sample',
  sourceModel: { name: 'test', landmarkCount: 33 },
  metadata: { fps: 25, durationMs: 1000, totalFramesInVideo: 25, sampledFrameCount: 5, frameSamplingRate: 'test' },
  quality: { personDetected: true, averageLandmarkConfidence: 0.9, lowConfidenceFrames: [], warnings: [] },
  frames: [45, 70, 110, 70, 45].map((kneeAngle, index) =>
    makeFrame(index, { leftVisibility: 0.9, rightVisibility: 0.88, width: 0.18, kneeAngle, hipAngle: kneeAngle + 10 })
  )
}, 'squat')
assert(['good', 'excessive_but_controlled', 'acceptable'].includes(deepControlled.scoringContext.metrics.rangeOfMotion.interpretation))
assert.notStrictEqual(deepControlled.scoringContext.metrics.rangeOfMotion.interpretation, 'problematic')

const naturalAngleChanges = MovementSummaryService.summarize({
  videoId: 'sample',
  sourceModel: { name: 'test', landmarkCount: 33 },
  metadata: { fps: 25, durationMs: 1000, totalFramesInVideo: 25, sampledFrameCount: 5, frameSamplingRate: 'test' },
  quality: { personDetected: true, averageLandmarkConfidence: 0.9, lowConfidenceFrames: [], warnings: [] },
  frames: [170, 130, 90, 130, 170].map((kneeAngle, index) =>
    makeFrame(index, { leftVisibility: 0.9, rightVisibility: 0.88, width: 0.18, kneeAngle, hipAngle: kneeAngle - 5 })
  )
}, 'squat')
assert.notStrictEqual(naturalAngleChanges.scoringContext.metrics.movementControl.interpretation, 'unstable')

const prompt = require('./src/services/ExerciseEvaluationPromptBuilder')
  .ExerciseEvaluationPromptBuilder
  .buildPrompt('squat', deepControlled)
assert(prompt.includes('A single metric outside an ideal range must not create a very low score by itself.'))
assert(prompt.includes('Scores below 50 require multiple clear, reliable, severe faults'))

console.log('camera view sample cases passed')
