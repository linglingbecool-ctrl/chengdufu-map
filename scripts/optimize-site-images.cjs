// Build web previews without modifying archival originals.
// Run with sharp installed, or NODE_PATH pointing at the existing workspace runtime.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const points = JSON.parse(fs.readFileSync(path.join(root, 'points.json'), 'utf8'));
const files = [...new Set(points.flatMap(p => [p.oldImage, p.currentImage]).filter(f => f && /\.(png|jpe?g)$/i.test(f)))];
files.push('chengdu-map-original.jpg');
(async () => {
  const output = path.join(root, 'media/optimized');
  fs.mkdirSync(output, { recursive: true });
  let before = 0, after = 0;
  for (const file of files) {
    assert.equal(path.basename(file), file, 'Original images must be repository-root files');
    const source = path.join(root, file);
    const target = path.join(output, file.replace(/\.(png|jpe?g)$/i, '.webp'));
    let pipeline = sharp(source).rotate();
    const isMap = file === 'chengdu-map-original.jpg';
    // Keep the main map at full resolution for zoom; cards need at most 960 px.
    if (!isMap) pipeline = pipeline.resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true });
    await pipeline.webp({ quality: isMap ? 76 : 82, effort: 5 }).toFile(target);
    const originalSize = fs.statSync(source).size, previewSize = fs.statSync(target).size;
    assert(previewSize < originalSize, `${file}: preview should be smaller`);
    before += originalSize; after += previewSize;
    console.log(`${file}: ${originalSize} -> ${previewSize} bytes`);
  }
  console.log(JSON.stringify({ images: files.length, before, after, savedPercent: Math.round(100 * (1 - after / before)) }));
})().catch(error => { console.error(error); process.exitCode = 1; });
