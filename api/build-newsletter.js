const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;

// Base URL for fetching data files and linking
const SITE = 'https://cafayate.com';

module.exports = async function handler(req, res) {
  // Allow GET for cron trigger, POST for manual
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check — cron requests come from Vercel with no key needed via GET
  // Manual POST requests require admin key
  if (req.method === 'POST') {
    const key = req.query.key || req.body.key;
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Fetch all data sources in parallel
    const [blogRes, eventsRes, propertiesRes, newsletterRes, subscribersData] = await Promise.all([
      fetch(SITE + '/data/blog.json').then(r => r.json()),
      fetch(SITE + '/data/events.json').then(r => r.json()),
      fetch(SITE + '/data/properties.json').then(r => r.json()),
      fetch(SITE + '/data/newsletter.json').then(r => r.json()),
      AUDIENCE_ID ? resend.contacts.list({ audienceId: AUDIENCE_ID }) : Promise.resolve({ data: { data: [] } }),
    ]);

    const blog = blogRes || [];
    const events = eventsRes || [];
    const properties = propertiesRes || [];
    const newsletter = newsletterRes || {};
    const contacts = subscribersData?.data?.data || [];
    const activeCount = contacts.filter(c => !c.unsubscribed).length;

    // Get the latest blog post (most recent by date)
    const sortedBlog = blog.slice().sort((a, b) => b.date.localeCompare(a.date));
    const latestPost = sortedBlog[0];

    // Get upcoming events (next 14 days)
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events
      .filter(e => {
        const d = new Date(e.date);
        return d >= now && d <= twoWeeks;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    // Get properties added in last 30 days (check if they have a date field, otherwise show all)
    const recentProperties = properties.slice(0, 3);

    // Build the newsletter date string
    const weekOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Generate subject line
    const subject = latestPost
      ? `Cafayate This Week: ${latestPost.title_en}`
      : `Cafayate.com Weekly — ${weekOf}`;

    // Build HTML sections
    const html = buildNewsletterHTML({
      editorsNote: newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
      weekOf,
    });

    // Build approve link
    const approveUrl = `${SITE}/api/approve-newsletter?key=${ADMIN_KEY}`;

    // Add approve/skip buttons at the top of the preview
    const previewBanner = `
      <div style="background:#fff3cd;border:2px solid #ffc107;border-radius:6px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;color:#333;margin:0 0 12px;font-weight:600;">
          📬 This is your weekly newsletter preview — ${activeCount} subscriber${activeCount !== 1 ? 's' : ''} will receive this.
        </p>
        <a href="${approveUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:15px;font-weight:600;margin:0 8px;">
          ✓ Approve &amp; Send
        </a>
      </div>
    `;

    // Send preview to admin
    await resend.emails.send({
      from: 'Cafayate.com <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[PREVIEW] ${subject}`,
      html: wrapNewsletter(subject, previewBanner + html),
    });

    return res.status(200).json({
      success: true,
      preview: true,
      subject,
      activeSubscribers: activeCount,
      sections: {
        editorsNote: !!newsletter.editors_note,
        blog: !!latestPost,
        events: upcoming.length,
        properties: recentProperties.length,
        sponsors: (newsletter.sponsors || []).length,
      },
      message: `Preview sent to dwgalland@gmail.com. ${activeCount} subscribers would receive this. To send, POST to /api/send-newsletter with the key and approve: true.`,
    });
  } catch (err) {
    console.error('Build newsletter error:', err);
    return res.status(500).json({ error: 'Failed to build newsletter: ' + err.message });
  }
};

function buildNewsletterHTML({ editorsNote, latestPost, upcoming, properties, sponsors, weekOf }) {
  let html = '';

  // --- Editor's Note ---
  if (editorsNote) {
    html += `
      <div style="margin-bottom:28px;">
        <p style="font-size:15px;line-height:1.7;color:#555;font-style:italic;border-left:3px solid #1e6a3a;padding-left:16px;margin:0;">
          ${editorsNote}
        </p>
        <p style="font-size:13px;color:#999;margin:8px 0 0;">— David Galland, Editor</p>
      </div>
    `;
  }

  // --- Latest Blog Post ---
  if (latestPost) {
    const postUrl = SITE + '/en/pages/blog#' + latestPost.slug;
    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          📝 Latest from the Blog
        </h2>
        ${latestPost.image ? '<a href="' + postUrl + '" style="text-decoration:none;"><img src="' + SITE + latestPost.image + '" alt="' + latestPost.title_en + '" style="width:100%;max-height:220px;object-fit:cover;border-radius:4px;margin-bottom:12px;"></a>' : ''}
        <h3 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;">
          <a href="${postUrl}" style="color:#333;text-decoration:none;">${latestPost.title_en}</a>
        </h3>
        <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 12px;">
          ${latestPost.description_en}
        </p>
        <a href="${postUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:10px 22px;text-decoration:none;border-radius:3px;font-size:14px;font-weight:600;">Read More →</a>
      </div>
    `;
  }

  // --- Upcoming Events ---
  if (upcoming.length > 0) {
    let eventsHtml = '';
    upcoming.forEach(function(event) {
      const eventDate = new Date(event.date + 'T12:00:00');
      const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      eventsHtml += `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;width:100px;">
            <span style="font-size:13px;font-weight:600;color:#1e6a3a;">${dateStr}</span>
            ${event.time ? '<br><span style="font-size:12px;color:#999;">' + event.time + '</span>' : ''}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <strong style="font-size:14px;color:#333;">${event.title_en}</strong>
            <br><span style="font-size:12px;color:#777;">${event.location}</span>
          </td>
        </tr>
      `;
    });

    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          📅 Upcoming Events
        </h2>
        <table style="width:100%;border-collapse:collapse;">
          ${eventsHtml}
        </table>
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}/en/pages/agenda" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">View all events →</a>
        </p>
      </div>
    `;
  }

  // --- Properties ---
  if (properties.length > 0) {
    let propsHtml = '';
    properties.forEach(function(prop) {
      const propUrl = prop.website || SITE + '/en/pages/propiedad';
      propsHtml += `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #eee;">
          ${prop.image ? '<img src="' + SITE + prop.image + '" alt="' + prop.title_en + '" style="width:100px;height:75px;object-fit:cover;border-radius:3px;flex-shrink:0;">' : ''}
          <div>
            <strong style="font-size:14px;color:#333;">${prop.title_en}</strong>
            <br><span style="font-size:12px;color:#777;">${prop.location_en}${prop.size ? ' · ' + prop.size : ''}</span>
            <br><a href="${propUrl}" style="font-size:12px;color:#1e6a3a;text-decoration:underline;">View details →</a>
          </div>
        </div>
      `;
    });

    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          🏡 Property Listings
        </h2>
        ${propsHtml}
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}/en/pages/propiedad" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">View all properties →</a>
        </p>
      </div>
    `;
  }

  // --- Sponsors ---
  if (sponsors.length > 0) {
    let sponsorsHtml = '';
    sponsors.forEach(function(sponsor) {
      sponsorsHtml += `
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin-bottom:12px;text-align:center;">
          ${sponsor.image ? '<a href="' + sponsor.url + '"><img src="' + SITE + sponsor.image + '" alt="' + sponsor.name + '" style="max-width:180px;max-height:60px;margin-bottom:10px;"></a>' : ''}
          <p style="font-size:14px;color:#333;margin:0 0 8px;"><strong>${sponsor.name}</strong></p>
          <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 10px;">${sponsor.description_en}</p>
          <a href="${sponsor.url}" style="display:inline-block;background:#c0392b;color:#fff;padding:8px 20px;text-decoration:none;border-radius:3px;font-size:13px;font-weight:600;">Visit ${sponsor.name.split(' ')[0]} →</a>
        </div>
      `;
    });

    html += `
      <div style="margin-bottom:12px;">
        <h2 style="font-family:Georgia,serif;color:#999;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;border-bottom:1px solid #ddd;padding-bottom:8px;">
          Our Sponsors
        </h2>
        ${sponsorsHtml}
      </div>
    `;
  }

  return html;
}

function wrapNewsletter(subject, bodyHtml, firstName) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#333;">
      <div style="background:#1e6a3a;padding:24px 30px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;"><a href="https://cafayate.com" style="color:#fff;text-decoration:none;">CAFAYATE.COM</a></h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;letter-spacing:1px;">INSIDER'S GUIDE TO SALTA'S WINE REGION</p>
      </div>
      <div style="padding:30px;background:#fff;">
        <p style="font-size:15px;color:#555;">${greeting}</p>
        ${bodyHtml}
      </div>
      <div style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:3px solid #c0392b;">
        <p style="font-size:12px;color:#999;margin:0;">
          <a href="https://cafayate.com" style="color:#1e6a3a;">cafayate.com</a> — A not-for-profit project supporting local charities
        </p>
        <p style="font-size:11px;color:#bbb;margin:8px 0 0;">
          To unsubscribe, reply with "unsubscribe" in the subject line.
        </p>
      </div>
    </div>
  `;
}
