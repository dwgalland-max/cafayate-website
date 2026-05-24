const { Resend } = require('resend');
const { buildNewsletterHTML, wrapNewsletter, STRINGS } = require('./build-newsletter');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const SITE = 'https://cafayate.com';

const GITHUB_OWNER = 'dwgalland-max';
const GITHUB_REPO = 'cafayate-website';
const GITHUB_BRANCH = 'main';
const STATE_PATH = 'data/newsletter-state.json';

// Two layers of double-send protection:
//
//   1. In-memory short-window guard — catches rapid double-clicks while the
//      serverless instance is warm. Reset on cold start.
//   2. Persistent guard via data/newsletter-state.json committed through the
//      GitHub API — survives cold starts and covers the entire biweekly cycle.
//
// Override either guard by appending ?force=1 to the URL.
let lastSentAt = 0;
const MIN_SEND_INTERVAL_MS = 10 * 60 * 1000;      // 10 minutes
const PERSISTENT_SEND_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;  // 6 days

async function getState() {
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${STATE_PATH}?ref=${GITHUB_BRANCH}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      state: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')),
      sha: data.sha,
    };
  } catch (err) {
    console.error('[approve] getState error:', err.message);
    return null;
  }
}

async function setState(newState, sha) {
  if (!process.env.GITHUB_TOKEN) return false;
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${STATE_PATH}`;
    const content = Buffer.from(JSON.stringify(newState, null, 2) + '\n').toString('base64');
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Newsletter sent: ${newState.last_subject_en || 'untitled'}`,
        content,
        sha,
        branch: GITHUB_BRANCH,
      }),
    });
    if (!resp.ok) {
      console.error('[approve] setState failed:', resp.status, await resp.text());
    }
    return resp.ok;
  } catch (err) {
    console.error('[approve] setState error:', err.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = req.query.key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).send(htmlPage('Unauthorized', 'Invalid admin key.'));
  }

  if (!AUDIENCE_ID) {
    return res.status(500).send(htmlPage('Error', 'RESEND_AUDIENCE_ID not configured.'));
  }

  const force = req.query.force === '1';

  // GET = render a confirmation page only. No side effects.
  // This prevents email scanners / Gmail Safe Browsing / link previewers /
  // any other automated GET-fetcher from triggering an actual send by
  // following the link in the preview email.
  if (req.method === 'GET') {
    const state = await getState();
    const lastSent = state && state.state && state.state.last_sent_at
      ? new Date(state.state.last_sent_at)
      : null;
    return res.status(200).send(confirmationPage(key, lastSent, force));
  }

  // POST = actually perform the send. From here on it's identical to the
  // previous flow, plus the persistent guard.
  const now = Date.now();

  // Layer 1: in-memory short-window guard
  if (!force && lastSentAt && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
    const ago = Math.round((now - lastSentAt) / 1000);
    const waitSec = Math.ceil((MIN_SEND_INTERVAL_MS - (now - lastSentAt)) / 1000);
    return res.status(429).send(htmlPage(
      'Already sent (this instance)',
      `A newsletter was already sent ${ago} seconds ago. Wait ${waitSec} seconds or append &force=1.`
    ));
  }

  // Layer 2: persistent guard via state file
  let stateResp = await getState();
  if (!force && stateResp && stateResp.state.last_sent_at) {
    const elapsedMs = now - new Date(stateResp.state.last_sent_at).getTime();
    if (elapsedMs >= 0 && elapsedMs < PERSISTENT_SEND_WINDOW_MS) {
      const hoursAgo = Math.round(elapsedMs / 3600000);
      const daysLeft = Math.ceil((PERSISTENT_SEND_WINDOW_MS - elapsedMs) / 86400000);
      return res.status(429).send(htmlPage(
        'Already sent',
        `A newsletter was sent ${hoursAgo} hours ago ("${stateResp.state.last_subject_en || 'previous edition'}"). Refusing to send another within the ${Math.round(PERSISTENT_SEND_WINDOW_MS/86400000)}-day window (${daysLeft} day${daysLeft===1?'':'s'} left). Append &force=1 to the URL if you really want to override.`
      ));
    }
  }

  try {
    // Rebuild the newsletter fresh (same logic as build-newsletter)
    const [blogRes, eventsRes, propertiesRes, newsletterRes] = await Promise.all([
      fetch(SITE + '/data/blog.json').then(r => r.json()),
      fetch(SITE + '/data/events.json').then(r => r.json()),
      // properties.json was removed when the propiedad page moved to a static realtor directory.
      // Empty array means buildNewsletterHTML's `if (properties.length > 0)` skips the section.
      Promise.resolve([]),
      fetch(SITE + '/data/newsletter.json').then(r => r.json()),
    ]);

    const blog = blogRes || [];
    const events = eventsRes || [];
    const properties = propertiesRes || [];
    const newsletter = newsletterRes || {};

    const sortedBlog = blog.slice().sort((a, b) => b.date.localeCompare(a.date));
    const latestPost = sortedBlog[0];
    const now = new Date();
    // Match build-newsletter: 90-day window so anchor events that are months
    // out (Cruce Calchaquí, patron saint days) still surface.
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const upcoming = events
      .filter(e => { const d = new Date(e.date); return d >= now && d <= ninetyDays; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    const recentProperties = properties.slice(0, 3);

    const subjectEn = latestPost
      ? STRINGS.en.subjectPrefix + (latestPost.title_en || '')
      : STRINGS.en.subjectFallback;
    const subjectEs = latestPost
      ? STRINGS.es.subjectPrefix + (latestPost.title_es || latestPost.title_en || '')
      : STRINGS.es.subjectFallback;

    const bodyEn = buildNewsletterHTML({
      editorsNote: newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
    }, 'en');

    const bodyEs = buildNewsletterHTML({
      editorsNote: newsletter.editors_note_es || newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
    }, 'es');

    // Fetch subscribers
    const { data: contactsData, error: contactsError } = await resend.contacts.list({
      audienceId: AUDIENCE_ID,
    });

    if (contactsError) {
      return res.status(500).send(htmlPage('Error', 'Failed to fetch subscribers.'));
    }

    const contacts = contactsData?.data || [];
    const active = contacts.filter(c => !c.unsubscribed);

    if (active.length === 0) {
      return res.status(200).send(htmlPage('No Subscribers', 'There are no active subscribers to send to.'));
    }

    // Split by language (last_name field holds 'en' or 'es', default 'en')
    const esSubscribers = active.filter(c => (c.last_name || '').toLowerCase() === 'es');
    const enSubscribers = active.filter(c => (c.last_name || '').toLowerCase() !== 'es');

    const batchSize = 50;
    let sentEn = 0, sentEs = 0;
    const errors = [];

    // Send English version
    for (let i = 0; i < enSubscribers.length; i += batchSize) {
      const batch = enSubscribers.slice(i, i + batchSize);
      const promises = batch.map(contact =>
        resend.emails.send({
          from: 'Cafayate.com <noreply@cafayate.com>',
          to: contact.email,
          subject: subjectEn,
          html: wrapNewsletter(subjectEn, bodyEn, 'en', contact.first_name),
        })
          .then(() => { sentEn++; })
          .catch(err => { errors.push({ email: contact.email, lang: 'en', error: err.message }); })
      );
      await Promise.all(promises);
    }

    // Send Spanish version
    for (let i = 0; i < esSubscribers.length; i += batchSize) {
      const batch = esSubscribers.slice(i, i + batchSize);
      const promises = batch.map(contact =>
        resend.emails.send({
          from: 'Cafayate.com <noreply@cafayate.com>',
          to: contact.email,
          subject: subjectEs,
          html: wrapNewsletter(subjectEs, bodyEs, 'es', contact.first_name),
        })
          .then(() => { sentEs++; })
          .catch(err => { errors.push({ email: contact.email, lang: 'es', error: err.message }); })
      );
      await Promise.all(promises);
    }

    const totalSent = sentEn + sentEs;
    const totalSubs = active.length;

    // Record successful send — both in-memory (warm-instance fast path) and
    // persistent (state file via GitHub API, survives cold starts).
    if (totalSent > 0) {
      lastSentAt = Date.now();
      const newState = {
        last_sent_at: new Date().toISOString(),
        last_subject_en: subjectEn,
        last_subject_es: subjectEs,
        last_sent_count: totalSent,
      };
      const wrote = await setState(newState, stateResp && stateResp.sha);
      if (!wrote) console.error('[approve] Failed to persist last_sent state — next send will not be guarded.');
    }

    await resend.emails.send({
      from: 'Cafayate.com <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[Cafayate.com] Newsletter sent: ${subjectEn}`,
      html: `
        <h2>Newsletter Send Report</h2>
        <p><strong>English:</strong> ${sentEn} of ${enSubscribers.length} — subject "${subjectEn}"</p>
        <p><strong>Spanish:</strong> ${sentEs} of ${esSubscribers.length} — subject "${subjectEs}"</p>
        <p><strong>Total sent:</strong> ${totalSent} of ${totalSubs}</p>
        ${errors.length > 0 ? '<p><strong>Errors:</strong><br>' + errors.map(e => `${e.email} (${e.lang}): ${e.error}`).join('<br>') + '</p>' : '<p style="color:#2d8a4e;"><strong>All emails sent successfully.</strong></p>'}
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
    });

    return res.status(200).send(htmlPage(
      'Newsletter Sent! ✓',
      `Sent to ${totalSent} of ${totalSubs} subscribers (${sentEn} English, ${sentEs} Spanish).${errors.length > 0 ? ' Errors: ' + errors.length : ''}`
    ));
  } catch (err) {
    console.error('Approve newsletter error:', err);
    return res.status(500).send(htmlPage('Error', 'Failed to send newsletter: ' + err.message));
  }
};

function htmlPage(title, message) {
  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
    .card{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);text-align:center;max-width:500px;}
    h1{color:#1e6a3a;font-family:Georgia,serif;margin:0 0 16px;}p{color:#555;font-size:16px;line-height:1.6;}</style>
    </head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function confirmationPage(key, lastSent, force) {
  const lastSentLine = lastSent
    ? `<p class="muted">Last newsletter was sent on ${lastSent.toUTCString()}.</p>`
    : '';
  const forceQuery = force ? '&force=1' : '';
  return `<!DOCTYPE html><html><head><title>Confirm Newsletter Send</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;padding:20px;box-sizing:border-box;}
      .card{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);text-align:center;max-width:520px;}
      h1{color:#1e6a3a;font-family:Georgia,serif;margin:0 0 12px;font-size:24px;}
      p{color:#555;font-size:15px;line-height:1.6;margin:0 0 18px;}
      .muted{color:#888;font-size:13px;}
      button{background:#1e6a3a;color:#fff;border:0;padding:13px 36px;font-size:15px;font-weight:600;border-radius:4px;cursor:pointer;font-family:inherit;}
      button:hover{background:#155227;}
      .note{font-size:12px;color:#aaa;margin-top:28px;border-top:1px solid #eee;padding-top:16px;}
    </style></head><body><div class="card">
    <h1>Confirm Newsletter Send</h1>
    <p>You're about to send the latest newsletter to all active subscribers.</p>
    ${lastSentLine}
    <form method="POST" action="/api/approve-newsletter?key=${encodeURIComponent(key)}${forceQuery}">
      <button type="submit">Confirm &mdash; Send to all subscribers</button>
    </form>
    <p class="note">This confirmation step exists so email scanners and link previewers can't trigger a send by following the link from your inbox automatically.</p>
    </div></body></html>`;
}
