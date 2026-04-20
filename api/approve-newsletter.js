const { Resend } = require('resend');
const { buildNewsletterHTML, wrapNewsletter, STRINGS } = require('./build-newsletter');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const SITE = 'https://cafayate.com';

// Double-send guard: track the most recent successful send time on this warm instance.
// Refuses a second send within this window. Not a hard guarantee across cold starts,
// but catches the common cases (double-click, browser prefetch, page reload).
let lastSentAt = 0;
const MIN_SEND_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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

  // Double-send guard (override with ?force=1 for legitimate retries)
  const force = req.query.force === '1';
  const now = Date.now();
  if (!force && lastSentAt && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
    const ago = Math.round((now - lastSentAt) / 1000);
    const waitSec = Math.ceil((MIN_SEND_INTERVAL_MS - (now - lastSentAt)) / 1000);
    return res.status(429).send(htmlPage(
      'Already sent',
      `A newsletter was already sent ${ago} seconds ago. To prevent accidental double-sends, please wait ${waitSec} seconds, or append &force=1 to the URL if this is intentional.`
    ));
  }

  try {
    // Rebuild the newsletter fresh (same logic as build-newsletter)
    const [blogRes, eventsRes, propertiesRes, newsletterRes] = await Promise.all([
      fetch(SITE + '/data/blog.json').then(r => r.json()),
      fetch(SITE + '/data/events.json').then(r => r.json()),
      fetch(SITE + '/data/properties.json').then(r => r.json()),
      fetch(SITE + '/data/newsletter.json').then(r => r.json()),
    ]);

    const blog = blogRes || [];
    const events = eventsRes || [];
    const properties = propertiesRes || [];
    const newsletter = newsletterRes || {};

    const sortedBlog = blog.slice().sort((a, b) => b.date.localeCompare(a.date));
    const latestPost = sortedBlog[0];
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events
      .filter(e => { const d = new Date(e.date); return d >= now && d <= twoWeeks; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
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

    // Record successful send so any retry within the guard window is refused
    if (totalSent > 0) lastSentAt = Date.now();

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
