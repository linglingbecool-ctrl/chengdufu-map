// Rebuild point crops from the same scan and percentage coordinates as the live map.
// Usage (macOS): node scripts/crop-point-map.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scan = path.join(root, 'chengdu-map-original.jpg');
const metadata = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', scan], { encoding: 'utf8' });
const width = Number(metadata.match(/pixelWidth: (\d+)/)[1]);
const height = Number(metadata.match(/pixelHeight: (\d+)/)[1]);
const cropWidth = 620, cropHeight = 460;
assert(width >= cropWidth && height >= cropHeight);
const points = JSON.parse(fs.readFileSync(path.join(root, 'points.json'), 'utf8'));
for (const point of points.filter(p => p.detailLevel === 'basic')) {
  assert(/^[a-z]+$/.test(point.id));
  assert(Number.isFinite(point.x) && point.x >= 0 && point.x <= 100);
  assert(Number.isFinite(point.y) && point.y >= 0 && point.y <= 100);
  const x = Math.max(0, Math.min(width - cropWidth, Math.round(width * point.x / 100 - cropWidth / 2)));
  const y = Math.max(0, Math.min(height - cropHeight, Math.round(height * point.y / 100 - cropHeight / 2)));
  execFileSync('sips', ['-s', 'format', 'png', '-c', String(cropHeight), String(cropWidth), '--cropOffset', String(y), String(x), scan, '--out', path.join(root, `${point.id}-old.png`)]);
}
console.log(`Rebuilt ${points.filter(p => p.detailLevel === 'basic').length} crops from ${width} × ${height} original scan.`);
