const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, '..', 'images', 'photos');

// Rename + resize mapping: source -> destination
const photos = [
  { from: '20260413_110846.jpg', to: 'clubhouse-estancia-mountains.jpg' },
  { from: '20260413_111104.jpg', to: 'clubhouse-estancia-garden.jpg' },
  { from: '20260414_080628.jpg', to: 'lagoon-estancia-sunset.jpg' },
  { from: 'Golf in La Estancia.jpg', to: 'golf-flag-estancia.jpg' },
  { from: 'Lagoon in La Estancia.jpg', to: 'lagoon-estancia-morning.jpg' },
];

(async () => {
  for (const p of photos) {
    const src = path.join(PHOTOS_DIR, p.from);
    const dst = path.join(PHOTOS_DIR, p.to);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP (not found): ${p.from}`);
      continue;
    }
    if (fs.existsSync(dst)) {
      console.log(`  SKIP (already exists): ${p.to}`);
      fs.unlinkSync(src);
      continue;
    }
    await sharp(src)
      .rotate()              // auto-rotate based on EXIF
      .resize(1600, null, { withoutEnlargement: true })  // max 1600px wide
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(dst);
    const srcSize = (fs.statSync(src).size / 1024 / 1024).toFixed(1);
    const dstSize = (fs.statSync(dst).size / 1024 / 1024).toFixed(1);
    console.log(`  ${p.from} (${srcSize}MB) -> ${p.to} (${dstSize}MB)`);
    fs.unlinkSync(src);
  }
  console.log('Done.');
})();
