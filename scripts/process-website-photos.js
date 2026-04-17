/**
 * Processes photos from Dropbox/CAFAYATE CONTENT 2026/Photos for Website/
 * Resizes, renames, moves originals to processed/ subfolder.
 *
 * Pass rename mappings as a JSON array via the MAPPING env var, e.g.
 *   MAPPING='[{"from":"Amalaya Deck.jpg","to":"amalaya-deck-sunset.jpg"}]' node process-website-photos.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const HOME = process.env.USERPROFILE || process.env.HOME;
const SRC_DIR = path.join(HOME, 'Dropbox', 'CAFAYATE CONTENT 2026', 'Photos for Website');
const PROCESSED_DIR = path.join(SRC_DIR, 'processed');
const DST_DIR = path.join(__dirname, '..', 'images', 'photos');

const mapping = JSON.parse(process.env.MAPPING || '[]');

if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

(async () => {
  for (const p of mapping) {
    const src = path.join(SRC_DIR, p.from);
    const dst = path.join(DST_DIR, p.to);
    const archive = path.join(PROCESSED_DIR, p.from);

    if (!fs.existsSync(src)) {
      console.log(`  SKIP (not found): ${p.from}`);
      continue;
    }
    if (fs.existsSync(dst)) {
      console.log(`  SKIP (already exists on site): ${p.to}`);
      continue;
    }

    await sharp(src)
      .rotate()  // auto-rotate based on EXIF
      .resize(1600, null, { withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(dst);

    const srcSize = (fs.statSync(src).size / 1024 / 1024).toFixed(1);
    const dstSize = (fs.statSync(dst).size / 1024 / 1024).toFixed(1);
    console.log(`  ${p.from} (${srcSize}MB) -> images/photos/${p.to} (${dstSize}MB)`);

    // Move original to processed/
    fs.renameSync(src, archive);
  }
  console.log('Done.');
})();
