const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision');
function walk(dir) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
      return;
    }
    if (p.endsWith('.d.ts') || p.endsWith('.js')) {
      const txt = fs.readFileSync(p, 'utf8');
      if (txt.includes('detectForImage') || txt.includes('detect(') || txt.includes('PoseLandmarker')) {
        console.log('FILE', p);
      }
    }
  });
}
walk(root);
