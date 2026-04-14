const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const SITE = 'https://cafayate.com';

module.exports = async function handler(req, res) {
  // GET for one-click approve from email link
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

    // Build content
    const sortedBlog = blog.slice().sort((a, b) => b.date.localeCompare(a.date));
    const latestPost = sortedBlog[0];
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events
      .filter(e => { const d = new Date(e.date); return d >= now && d <= twoWeeks; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    const recentProperties = properties.slice(0, 3);
    const weekOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const subject = latestPost
      ? `Cafayate This Week: ${latestPost.title_en}`
      : `Cafayate.com Weekly — ${weekOf}`;

    const bodyHtml = buildNewsletterHTML({
      editorsNote: newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
      weekOf,
    });

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

    // Send to all subscribers in batches of 50
    const batchSize = 50;
    let sent = 0;
    let errors = [];

    for (let i = 0; i < active.length; i += batchSize) {
      const batch = active.slice(i, i + batchSize);
      const promises = batch.map(contact =>
        resend.emails.send({
          from: 'Cafayate.com <noreply@cafayate.com>',
          to: contact.email,
          subject: subject,
          html: wrapNewsletter(subject, bodyHtml, contact.first_name),
        })
          .then(() => { sent++; })
          .catch(err => {
            errors.push({ email: contact.email, error: err.message });
          })
      );
      await Promise.all(promises);
    }

    // Send admin report
    await resend.emails.send({
      from: 'Cafayate.com <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[Cafayate.com] Newsletter sent: "${subject}"`,
      html: `
        <h2>Newsletter Send Report</h2>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Sent:</strong> ${sent} of ${active.length} subscribers</p>
        ${errors.length > 0 ? '<p><strong>Errors:</strong> ' + errors.map(e => e.email).join(', ') + '</p>' : '<p style="color:#2d8a4e;"><strong>All emails sent successfully.</strong></p>'}
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
    });

    return res.status(200).send(htmlPage(
      'Newsletter Sent! ✓',
      `Successfully sent "${subject}" to ${sent} of ${active.length} subscribers.${errors.length > 0 ? ' Errors: ' + errors.length : ''}`
    ));
  } catch (err) {
    console.error('Approve newsletter error:', err);
    return res.status(500).send(htmlPage('Error', 'Failed to send newsletter: ' + err.message));
  }
};

// Simple HTML page for the browser response
function htmlPage(title, message) {
  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
    .card{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);text-align:center;max-width:500px;}
    h1{color:#1e6a3a;font-family:Georgia,serif;margin:0 0 16px;}p{color:#555;font-size:16px;line-height:1.6;}</style>
    </head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function buildNewsletterHTML({ editorsNote, latestPost, upcoming, properties, sponsors, weekOf }) {
  let html = '';

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

  if (latestPost) {
    const postUrl = SITE + '/en/pages/blog#' + latestPost.slug;
    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          Latest from the Blog
        </h2>
        ${latestPost.image ? '<a href="' + postUrl + '" style="text-decoration:none;"><img src="' + SITE + latestPost.image + '" alt="' + latestPost.title_en + '" style="width:100%;max-height:220px;object-fit:cover;border-radius:4px;margin-bottom:12px;"></a>' : ''}
        <h3 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;">
          <a href="${postUrl}" style="color:#333;text-decoration:none;">${latestPost.title_en}</a>
        </h3>
        <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 12px;">
          ${latestPost.description_en}
        </p>
        <a href="${postUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:10px 22px;text-decoration:none;border-radius:3px;font-size:14px;font-weight:600;">Read More</a>
      </div>
    `;
  }

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
          Upcoming Events
        </h2>
        <table style="width:100%;border-collapse:collapse;">
          ${eventsHtml}
        </table>
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}/en/pages/agenda" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">View all events</a>
        </p>
      </div>
    `;
  }

  if (properties.length > 0) {
    let propsHtml = '';
    properties.forEach(function(prop) {
      const propUrl = prop.website || SITE + '/en/pages/propiedad';
      propsHtml += `
        <div style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong style="font-size:14px;color:#333;">${prop.title_en}</strong>
          <br><span style="font-size:12px;color:#777;">${prop.location_en}${prop.size ? ' &middot; ' + prop.size : ''}</span>
          <br><a href="${propUrl}" style="font-size:12px;color:#1e6a3a;text-decoration:underline;">View details</a>
        </div>
      `;
    });

    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          Property Listings
        </h2>
        ${propsHtml}
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}/en/pages/propiedad" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">View all properties</a>
        </p>
      </div>
    `;
  }

  if (sponsors.length > 0) {
    let sponsorsHtml = '';
    sponsors.forEach(function(sponsor) {
      sponsorsHtml += `
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin-bottom:12px;text-align:center;">
          ${sponsor.image ? '<a href="' + sponsor.url + '"><img src="' + SITE + sponsor.image + '" alt="' + sponsor.name + '" style="max-width:180px;max-height:60px;margin-bottom:10px;"></a>' : ''}
          <p style="font-size:14px;color:#333;margin:0 0 8px;"><strong>${sponsor.name}</strong></p>
          <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 10px;">${sponsor.description_en}</p>
          <a href="${sponsor.url}" style="display:inline-block;background:#c0392b;color:#fff;padding:8px 20px;text-decoration:none;border-radius:3px;font-size:13px;font-weight:600;">Learn More</a>
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
