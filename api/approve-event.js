const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'dwgalland-max/cafayate-website';
const FILE_PATH = 'data/events.json';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = req.query.key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).send(errorPage('Unauthorized. Invalid admin key.'));
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).send(errorPage('GITHUB_TOKEN not configured in Vercel environment variables.'));
  }

  const eventB64 = req.query.event;
  if (!eventB64) {
    return res.status(400).send(errorPage('No event data provided.'));
  }

  try {
    // Decode the event from the URL
    const event = JSON.parse(Buffer.from(eventB64, 'base64url').toString('utf-8'));

    if (!event.title_en || !event.date) {
      return res.status(400).send(errorPage('Invalid event data — missing title or date.'));
    }

    // Fetch current events.json from GitHub
    const ghFileRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!ghFileRes.ok) {
      const errBody = await ghFileRes.text();
      console.error('GitHub fetch error:', errBody);
      return res.status(500).send(errorPage('Failed to fetch events.json from GitHub.'));
    }

    const ghFile = await ghFileRes.json();
    const currentContent = Buffer.from(ghFile.content, 'base64').toString('utf-8');
    const events = JSON.parse(currentContent);

    // Check for duplicate (same title + date)
    const isDuplicate = events.some(e => e.title_en === event.title_en && e.date === event.date);
    if (isDuplicate) {
      return res.status(200).send(successPage(event, true));
    }

    // Add the new event and sort by date
    events.push(event);
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Format the JSON nicely
    const newContent = JSON.stringify(events, null, 2) + '\n';
    const newContentB64 = Buffer.from(newContent).toString('base64');

    // Commit to GitHub
    const eventDate = new Date(event.date + 'T12:00:00');
    const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const commitMessage = `Add event: ${event.title_en} (${dateStr})`;

    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: newContentB64,
        sha: ghFile.sha,
      }),
    });

    if (!commitRes.ok) {
      const errBody = await commitRes.text();
      console.error('GitHub commit error:', errBody);
      return res.status(500).send(errorPage('Failed to commit event to GitHub. The file may have changed — try again.'));
    }

    // Send confirmation email
    try {
      await resend.emails.send({
        from: 'Cafayate.com Events <noreply@cafayate.com>',
        to: 'dwgalland@gmail.com',
        subject: `✓ Event Published: ${event.title_en}`,
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;color:#333;">
            <div style="background:#1e6a3a;padding:20px 30px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:24px;">
                <a href="https://cafayate.com" style="color:#fff;text-decoration:none;">CAFAYATE.COM</a>
              </h1>
            </div>
            <div style="padding:24px 30px;background:#fff;">
              <div style="background:#d4edda;border:1px solid #c3e6cb;border-radius:4px;padding:14px 18px;margin-bottom:16px;">
                <p style="margin:0;color:#155724;font-weight:600;">✓ Event published successfully!</p>
              </div>
              <p><strong>${event.title_en}</strong></p>
              <p>${new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${event.time ? ' at ' + event.time : ''}</p>
              <p>${event.location}</p>
              <p style="font-size:13px;color:#999;">The site will redeploy automatically. The event should be live on the <a href="https://cafayate.com/en/pages/agenda">agenda page</a> within a minute or two.</p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Confirmation email error:', emailErr);
    }

    return res.status(200).send(successPage(event, false));
  } catch (err) {
    console.error('Approve event error:', err);
    return res.status(500).send(errorPage('Error: ' + err.message));
  }
};

function successPage(event, isDuplicate) {
  const eventDate = new Date(event.date + 'T12:00:00');
  const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Event ${isDuplicate ? 'Already Exists' : 'Published'}</title></head>
<body style="margin:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:40px 20px;">
  <div style="max-width:500px;width:100%;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="background:#1e6a3a;padding:20px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:24px;">CAFAYATE.COM</h1>
    </div>
    <div style="padding:30px;">
      <div style="background:${isDuplicate ? '#fff3cd' : '#d4edda'};border-radius:4px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="font-size:18px;font-weight:600;margin:0;color:${isDuplicate ? '#856404' : '#155724'};">
          ${isDuplicate ? '⚠️ Event Already Exists' : '✅ Event Published!'}
        </p>
      </div>
      <h2 style="font-family:Georgia,serif;color:#333;margin:0 0 8px;">${event.title_en}</h2>
      <p style="color:#666;margin:0 0 4px;">📅 ${dateStr}${event.time ? ' at ' + event.time : ''}</p>
      <p style="color:#666;margin:0 0 16px;">📍 ${event.location}</p>
      ${isDuplicate ? '<p style="font-size:14px;color:#856404;">This event was already on the agenda. No changes made.</p>' : '<p style="font-size:14px;color:#555;">The site is redeploying now. The event will be live on the <a href="https://cafayate.com/en/pages/agenda" style="color:#1e6a3a;">agenda page</a> within a minute or two.</p>'}
    </div>
  </div>
</body></html>`;
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Error</title></head>
<body style="margin:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:40px 20px;">
  <div style="max-width:500px;width:100%;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="background:#c0392b;padding:20px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:24px;">CAFAYATE.COM</h1>
    </div>
    <div style="padding:30px;text-align:center;">
      <p style="font-size:18px;font-weight:600;color:#c0392b;">❌ Something went wrong</p>
      <p style="color:#666;font-size:14px;">${message}</p>
      <p style="color:#999;font-size:13px;margin-top:20px;">Contact <a href="mailto:info@cafayate.com">info@cafayate.com</a> if this persists.</p>
    </div>
  </div>
</body></html>`;
}
