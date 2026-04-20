const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;

// Base URL for fetching data files and linking
const SITE = 'https://cafayate.com';

// --- Translation strings for each language ---
const STRINGS = {
  en: {
    tagline: "INSIDER'S GUIDE TO SALTA'S WINE REGION",
    greeting: 'Hi',
    editorSign: 'David Galland, Editor',
    latestBlog: '📝 Latest from the Blog',
    readMore: 'Read More →',
    upcomingEvents: '📅 Upcoming Events',
    viewAllEvents: 'View all events →',
    properties: '🏡 Property Listings',
    viewAllProperties: 'View all properties →',
    viewDetails: 'View details →',
    ourSponsors: 'Our Sponsors',
    visit: 'Visit',
    footerNote: 'A not-for-profit project supporting local charities',
    unsubscribe: 'To unsubscribe, reply with "unsubscribe" in the subject line.',
    subjectPrefix: 'Cafayate This Week: ',
    subjectFallback: 'Cafayate.com Weekly',
    blogPath: '/en/pages/blog',
    agendaPath: '/en/pages/agenda',
    propertyPath: '/en/pages/propiedad',
    dateLocale: 'en-US',
  },
  es: {
    tagline: 'GUÍA DEL PAÍS DEL VINO DE SALTA',
    greeting: 'Hola',
    editorSign: 'David Galland, Editor',
    latestBlog: '📝 Último del Blog',
    readMore: 'Leer más →',
    upcomingEvents: '📅 Próximos Eventos',
    viewAllEvents: 'Ver todos los eventos →',
    properties: '🏡 Propiedades',
    viewAllProperties: 'Ver todas las propiedades →',
    viewDetails: 'Ver detalles →',
    ourSponsors: 'Nuestros Patrocinadores',
    visit: 'Visitar',
    footerNote: 'Un proyecto sin fines de lucro que apoya a organizaciones benéficas locales',
    unsubscribe: 'Para darse de baja, responda con "unsubscribe" en el asunto.',
    subjectPrefix: 'Cafayate Esta Semana: ',
    subjectFallback: 'Cafayate.com Semanal',
    blogPath: '/pages/blog',
    agendaPath: '/pages/agenda',
    propertyPath: '/pages/propiedad',
    dateLocale: 'es-AR',
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'POST') {
    const key = req.query.key || req.body.key;
    if (!ADMIN_KEY || key !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
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
    const active = contacts.filter(c => !c.unsubscribed);
    const esCount = active.filter(c => (c.last_name || '').toLowerCase() === 'es').length;
    const enCount = active.length - esCount;

    const sortedBlog = blog.slice().sort((a, b) => b.date.localeCompare(a.date));
    const latestPost = sortedBlog[0];

    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events
      .filter(e => {
        const d = new Date(e.date);
        return d >= now && d <= twoWeeks;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    const recentProperties = properties.slice(0, 3);

    const subjectEn = latestPost
      ? STRINGS.en.subjectPrefix + (latestPost.title_en || '')
      : STRINGS.en.subjectFallback;
    const subjectEs = latestPost
      ? STRINGS.es.subjectPrefix + (latestPost.title_es || latestPost.title_en || '')
      : STRINGS.es.subjectFallback;

    const htmlEn = buildNewsletterHTML({
      editorsNote: newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
    }, 'en');

    const htmlEs = buildNewsletterHTML({
      editorsNote: newsletter.editors_note_es || newsletter.editors_note || '',
      latestPost,
      upcoming,
      properties: recentProperties,
      sponsors: newsletter.sponsors || [],
    }, 'es');

    const approveUrl = `${SITE}/api/approve-newsletter?key=${ADMIN_KEY}`;

    const previewBanner = `
      <div style="background:#fff3cd;border:2px solid #ffc107;border-radius:6px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;color:#333;margin:0 0 12px;font-weight:600;">
          📬 Weekly newsletter preview — ${enCount} English subscriber${enCount !== 1 ? 's' : ''}, ${esCount} Spanish subscriber${esCount !== 1 ? 's' : ''}
        </p>
        <a href="${approveUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:15px;font-weight:600;margin:0 8px;">
          ✓ Approve &amp; Send (both languages)
        </a>
      </div>
    `;

    const sectionDivider = `
      <div style="margin:40px 0;padding:20px;background:#f5f5f5;border-radius:6px;text-align:center;">
        <p style="margin:0;font-size:16px;font-weight:700;color:#1e6a3a;letter-spacing:1px;">↓ VERSIÓN EN ESPAÑOL ↓</p>
      </div>
    `;

    await resend.emails.send({
      from: 'Cafayate.com <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[PREVIEW] ${subjectEn}`,
      html:
        previewBanner +
        wrapNewsletter(subjectEn, htmlEn, 'en') +
        sectionDivider +
        wrapNewsletter(subjectEs, htmlEs, 'es'),
    });

    return res.status(200).json({
      success: true,
      preview: true,
      subjects: { en: subjectEn, es: subjectEs },
      activeSubscribers: { en: enCount, es: esCount, total: active.length },
      sections: {
        editorsNote: !!newsletter.editors_note,
        blog: !!latestPost,
        events: upcoming.length,
        properties: recentProperties.length,
        sponsors: (newsletter.sponsors || []).length,
      },
      message: `Preview sent to dwgalland@gmail.com. ${enCount} EN subscribers and ${esCount} ES subscribers would receive this.`,
    });
  } catch (err) {
    console.error('Build newsletter error:', err);
    return res.status(500).json({ error: 'Failed to build newsletter: ' + err.message });
  }
};

function buildNewsletterHTML({ editorsNote, latestPost, upcoming, properties, sponsors }, lang) {
  const t = STRINGS[lang] || STRINGS.en;
  const title = (post) => post[`title_${lang}`] || post.title_en || '';
  const desc = (post) => post[`description_${lang}`] || post.description_en || '';
  const sponsorDesc = (s) => s[`description_${lang}`] || s.description_en || '';
  const propLocation = (p) => p[`location_${lang}`] || p.location_en || p.location || '';

  let html = '';

  if (editorsNote) {
    html += `
      <div style="margin-bottom:28px;">
        <p style="font-size:15px;line-height:1.7;color:#555;font-style:italic;border-left:3px solid #1e6a3a;padding-left:16px;margin:0;">
          ${editorsNote}
        </p>
        <p style="font-size:13px;color:#999;margin:8px 0 0;">— ${t.editorSign}</p>
      </div>
    `;
  }

  if (latestPost) {
    const postUrl = SITE + t.blogPath + '#' + latestPost.slug;
    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          ${t.latestBlog}
        </h2>
        ${latestPost.image ? '<a href="' + postUrl + '" style="text-decoration:none;"><img src="' + SITE + latestPost.image + '" alt="' + title(latestPost) + '" style="width:100%;max-height:220px;object-fit:cover;border-radius:4px;margin-bottom:12px;"></a>' : ''}
        <h3 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;">
          <a href="${postUrl}" style="color:#333;text-decoration:none;">${title(latestPost)}</a>
        </h3>
        <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 12px;">
          ${desc(latestPost)}
        </p>
        <a href="${postUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:10px 22px;text-decoration:none;border-radius:3px;font-size:14px;font-weight:600;">${t.readMore}</a>
      </div>
    `;
  }

  if (upcoming.length > 0) {
    let eventsHtml = '';
    upcoming.forEach(function(event) {
      const eventDate = new Date(event.date + 'T12:00:00');
      const dateStr = eventDate.toLocaleDateString(t.dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });
      eventsHtml += `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;width:100px;">
            <span style="font-size:13px;font-weight:600;color:#1e6a3a;">${dateStr}</span>
            ${event.time ? '<br><span style="font-size:12px;color:#999;">' + event.time + '</span>' : ''}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">
            <strong style="font-size:14px;color:#333;">${title(event)}</strong>
            <br><span style="font-size:12px;color:#777;">${event.location || ''}</span>
          </td>
        </tr>
      `;
    });

    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          ${t.upcomingEvents}
        </h2>
        <table style="width:100%;border-collapse:collapse;">
          ${eventsHtml}
        </table>
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}${t.agendaPath}" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">${t.viewAllEvents}</a>
        </p>
      </div>
    `;
  }

  if (properties.length > 0) {
    let propsHtml = '';
    properties.forEach(function(prop) {
      const propUrl = prop.website || SITE + t.propertyPath;
      propsHtml += `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #eee;">
          ${prop.image ? '<img src="' + SITE + prop.image + '" alt="' + title(prop) + '" style="width:100px;height:75px;object-fit:cover;border-radius:3px;flex-shrink:0;">' : ''}
          <div>
            <strong style="font-size:14px;color:#333;">${title(prop)}</strong>
            <br><span style="font-size:12px;color:#777;">${propLocation(prop)}${prop.size ? ' · ' + prop.size : ''}</span>
            <br><a href="${propUrl}" style="font-size:12px;color:#1e6a3a;text-decoration:underline;">${t.viewDetails}</a>
          </div>
        </div>
      `;
    });

    html += `
      <div style="margin-bottom:28px;">
        <h2 style="font-family:Georgia,serif;color:#1e6a3a;font-size:20px;margin:0 0 12px;border-bottom:2px solid #1e6a3a;padding-bottom:8px;">
          ${t.properties}
        </h2>
        ${propsHtml}
        <p style="margin:12px 0 0;text-align:center;">
          <a href="${SITE}${t.propertyPath}" style="font-size:13px;color:#1e6a3a;text-decoration:underline;">${t.viewAllProperties}</a>
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
          <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 10px;">${sponsorDesc(sponsor)}</p>
          <a href="${sponsor.url}" style="display:inline-block;background:#c0392b;color:#fff;padding:8px 20px;text-decoration:none;border-radius:3px;font-size:13px;font-weight:600;">${t.visit} ${sponsor.name.split(' ')[0]} →</a>
        </div>
      `;
    });

    html += `
      <div style="margin-bottom:12px;">
        <h2 style="font-family:Georgia,serif;color:#999;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;border-bottom:1px solid #ddd;padding-bottom:8px;">
          ${t.ourSponsors}
        </h2>
        ${sponsorsHtml}
      </div>
    `;
  }

  return html;
}

function wrapNewsletter(subject, bodyHtml, lang, firstName) {
  const t = STRINGS[lang] || STRINGS.en;
  const greeting = firstName ? `${t.greeting} ${firstName},` : `${t.greeting},`;
  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#333;">
      <div style="background:#1e6a3a;padding:24px 30px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;"><a href="https://cafayate.com" style="color:#fff;text-decoration:none;">CAFAYATE.COM</a></h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;letter-spacing:1px;">${t.tagline}</p>
      </div>
      <div style="padding:30px;background:#fff;">
        <p style="font-size:15px;color:#555;">${greeting}</p>
        ${bodyHtml}
      </div>
      <div style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:3px solid #c0392b;">
        <p style="font-size:12px;color:#999;margin:0;">
          <a href="https://cafayate.com" style="color:#1e6a3a;">cafayate.com</a> — ${t.footerNote}
        </p>
        <p style="font-size:11px;color:#bbb;margin:8px 0 0;">
          ${t.unsubscribe}
        </p>
      </div>
    </div>
  `;
}

// Export helpers so approve-newsletter.js can reuse them
module.exports.buildNewsletterHTML = buildNewsletterHTML;
module.exports.wrapNewsletter = wrapNewsletter;
module.exports.STRINGS = STRINGS;
