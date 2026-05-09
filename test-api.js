/**
 * Test script for Exercise Pose Estimation API
 * 
 * RECOMMENDED APPROACH: This script uses the form-data package which is the
 * best practice for Node.js file uploads. It properly handles ReadStreams
 * and is compatible with axios and other HTTP libraries.
 * 
 * Usage:
 *   node test-api.js                           # Test health check
 *   node test-api.js "path/to/video.mp4"      # Test with video
 *   API_URL=http://localhost:4000 node test-api.js "video.mp4"  # Custom port
 */

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';

async function testHealthCheck() {
  console.log('\n=== Testing Health Check ===');
  try {
    const response = await fetch(`${API_BASE_URL}/api/pose/health`);
    const data = await response.json();
    console.log('✓ Health check passed:', data);
    return true;
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
    return false;
  }
}

async function testVideoAnalysis(videoPath) {
  console.log('\n=== Testing Video Analysis ===');

  // Check if file exists
  if (!fs.existsSync(videoPath)) {
    console.error(`✗ Video file not found: ${videoPath}`);
    console.log('   Please provide a valid video file path');
    return;
  }

  try {
    const form = new FormData();
    form.append('video', fs.createReadStream(videoPath));

    const response = await fetch(`${API_BASE_URL}/api/pose/analyze-video`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`✗ API returned status ${response.status}:`, error);
      return;
    }

    const data = await response.json();
    console.log('✓ Video analysis successful');
    console.log('  Video ID:', data.videoId);
    console.log('  Frames analyzed:', data.metadata.sampledFrameCount);
    console.log('  Average confidence:', data.quality.averageLandmarkConfidence);
    
    return data;
  } catch (error) {
    console.error('✗ Video analysis failed:', error.message);
  }
}

async function testWithSummary(videoPath) {
  console.log('\n=== Testing Video Analysis with Summary ===');

  if (!fs.existsSync(videoPath)) {
    console.error(`✗ Video file not found: ${videoPath}`);
    return;
  }

  try {
    const form = new FormData();
    form.append('video', fs.createReadStream(videoPath));

    const response = await fetch(`${API_BASE_URL}/api/pose/analyze-video?includeSummary=true`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`✗ API returned status ${response.status}:`, error);
      return;
    }

    const data = await response.json();
    console.log('✓ Video analysis with summary successful');
    console.log('  Estimated reps:', data.summary.repMetrics.estimatedRepCount);
    console.log('  Symmetry score:', data.summary.symmetry.overallSymmetryScore.toFixed(2));
    console.log('  Consistency score:', data.summary.movementConsistency.overallConsistencyScore.toFixed(2));
  } catch (error) {
    console.error('✗ Video analysis with summary failed:', error.message);
  }
}

async function main() {
  console.log('Exercise Pose Estimation API - Test Script');
  console.log('=========================================');

  // Test health check
  const healthy = await testHealthCheck();
  if (!healthy) {
    console.log('\n⚠ Server is not running. Start it with: npm run dev');
    process.exit(1);
  }

  // Get video file from command line or use placeholder
  const videoPath = process.argv[2] || './sample-video.mp4';

  // Run tests
  await testVideoAnalysis(videoPath);
  await testWithSummary(videoPath);

  console.log('\n✓ Tests completed');
}

main().catch(console.error);
