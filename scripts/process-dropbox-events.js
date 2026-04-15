/**
 * Local script to process event .txt files from the Dropbox Events folder.
 * Reads each file, parses the event details, and POSTs them to the submit-event API.
 *
 * Usage: node scripts/process-dropbox-events.js
 *
 * Requires:
 *   NEWSLETTER_ADMIN_KEY env var (or pass as first arg)
 *   Dropbox Events folder at the expected path
 */

const fs = require('fs');
const path = require('path');

const EVENTS_FOLDER = path.join(process.env.USERPROFILE || process.env.HOME, 'Dropbox', 'CAFAYATE CONTENT 2026', 'Events');
const SITE = process.env.SITE_URL || 'https://cafayate.com';
const ADMIN_KEY = process.argv[2] || process.env.NEWSLETTER_ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error('Error: Pass admin key as argument or set NEWSLETTER_ADMIN_KEY env var');
  process.exit(1);
}

function parseEventFile(content) {
  const lines = content.split('\n');
  const event = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Title (English):')) event.title_en = trimmed.replace('Title (English):', '').trim();
    else if (trimmed.startsWith('Title (Spanish):')) event.title_es = trimmed.replace('Title (Spanish):', '').trim();
    else if (trimmed.startsWith('Date:')) event.date = trimmed.replace('Date:', '').trim();
    else if (trimmed.startsWith('Time:')) event.time = trimmed.replace('Time:', '').trim();
    else if (trimmed.startsWith('Location:')) event.location = trimmed.replace('Location:', '').trim();
    else if (trimmed.startsWith('Category:')) event.category = trimmed.replace('Category:', '').trim().split('/')[0].trim().split(' ')[0].trim();
    else if (trimmed.startsWith('Website:')) event.website = trimmed.replace('Website:', '').trim();
    else if (trimmed.startsWith('Description (English):')) {
      const idx = lines.indexOf(line);
      const descLines = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('Description (Spanish):') || lines[i].trim().startsWith('===')) break;
        if (lines[i].trim()) descLines.push(lines[i].trim());
      }
      event.description_en = descLines.join(' ');
    }
    else if (trimmed.startsWith('Description (Spanish):')) {
      const idx = lines.indexOf(line);
      const descLines = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('===') || lines[i].trim().startsWith('INSTRUCTIONS')) break;
        if (lines[i].trim()) descLines.push(lines[i].trim());
      }
      event.description_es = descLines.join(' ');
    }
  }

  return event;
}

async function main() {
  if (!fs.existsSync(EVENTS_FOLDER)) {
    console.error('Events folder not found:', EVENTS_FOLDER);
    process.exit(1);
  }

  const files = fs.readdirSync(EVENTS_FOLDER)
    .filter(f => f.endsWith('.txt') && f !== 'EVENT TEMPLATE.txt')
    .sort();

  if (files.length === 0) {
    console.log('No event files to process.');
    return;
  }

  console.log(`Found ${files.length} event file(s):\n`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(EVENTS_FOLDER, file), 'utf-8');
    const event = parseEventFile(content);

    if (!event.title_en || !event.date) {
      console.log(`  ⚠ Skipping "${file}" — missing title or date`);
      continue;
    }

    console.log(`  📅 ${event.title_en} (${event.date})`);
    console.log(`     Location: ${event.location || 'Cafayate'}`);
    console.log(`     Submitting for approval...`);

    try {
      const response = await fetch(`${SITE}/api/submit-event?key=${ADMIN_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...event, key: ADMIN_KEY }),
      });

      const result = await response.json();
      if (result.success) {
        console.log(`     ✓ Approval email sent\n`);
        // Move processed file to a 'processed' subfolder
        const processedDir = path.join(EVENTS_FOLDER, 'processed');
        if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
        fs.renameSync(path.join(EVENTS_FOLDER, file), path.join(processedDir, file));
      } else {
        console.log(`     ✗ Error: ${result.error}\n`);
      }
    } catch (err) {
      console.log(`     ✗ Failed: ${err.message}\n`);
    }
  }

  console.log('Done. Check your email for approval links.');
}

main();
