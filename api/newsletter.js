const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

// --- Rate limiting (in-memory, resets on cold start) ---
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 2;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://cafayate.com', 'https://www.cafayate.com'];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { name, email, website, lang, _t } = req.body;
    const subscriberLang = lang === 'es' ? 'es' : 'en';

    // Honeypot — if "website" field has a value, it's a bot
    if (website) {
      // Return fake success so bot doesn't retry
      return res.status(200).json({ success: true });
    }

    // Timing check — if submitted faster than 3 seconds, likely a bot
    if (_t && typeof _t === 'number' && _t < 3000) {
      return res.status(200).json({ success: true });
    }

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Name validation — reject gibberish bot names
    // Must be 2-60 chars, contain at least one vowel, no more than 4 consecutive consonants
    const nameTrimmed = name.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 60) {
      return res.status(400).json({ error: 'Please enter a valid name.' });
    }
    if (!/[aeiouAEIOU]/.test(nameTrimmed)) {
      return res.status(200).json({ success: true }); // fake success for bots
    }
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(nameTrimmed)) {
      return res.status(200).json({ success: true }); // fake success for bots
    }
    // Reject names that are mostly uppercase random chars (like "McPASNbaTeaEwwQkNEDjr")
    const upperCount = (nameTrimmed.match(/[A-Z]/g) || []).length;
    if (nameTrimmed.length > 8 && upperCount > nameTrimmed.length * 0.4) {
      return res.status(200).json({ success: true }); // fake success for bots
    }

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);

    // 1. Add subscriber to Resend audience (persistent database)
    if (AUDIENCE_ID) {
      try {
        await resend.contacts.create({
          audienceId: AUDIENCE_ID,
          email: email,
          firstName: name.trim(),
          lastName: subscriberLang,
          unsubscribed: false,
        });
      } catch (contactErr) {
        // Contact may already exist — that's OK
        console.log('Contact create note:', contactErr.message || contactErr);
      }
    }

    // 2. Send welcome auto-response to subscriber (in their language)
    try {
      const welcome = subscriberLang === 'es' ? {
        subject: '¡Bienvenido al boletín de Cafayate.com!',
        tagline: 'GUÍA DEL PAÍS DEL VINO DE SALTA',
        greeting: `¡Bienvenido, ${safeName}!`,
        intro: 'Gracias por suscribirte al boletín de Cafayate.com. Recibirás novedades sobre:',
        bullets: [
          '<strong>Vinos y Bodegas</strong> — Nuevos lanzamientos, degustaciones y noticias de las bodegas de los Valles Calchaquíes',
          '<strong>Consejos de Viaje</strong> — Las mejores épocas para visitar, dónde alojarte y qué ver',
          '<strong>Cultura Local</strong> — Eventos, festivales y la vida en Cafayate',
          '<strong>Blog</strong> — Historias y guías de nuestra serie Vida en Cafayate',
        ],
        cta: 'Mientras tanto, explorá nuestro contenido más reciente:',
        button: 'Leer el Blog',
        blogUrl: 'https://cafayate.com/pages/blog.html',
        sign: '¡Salud desde Cafayate! 🍷',
        footer: 'Un proyecto sin fines de lucro que apoya a organizaciones benéficas locales',
        unsubscribe: 'Para darse de baja, responda a este correo con "unsubscribe" en el asunto.',
      } : {
        subject: 'Welcome to the Cafayate.com Newsletter!',
        tagline: "INSIDER'S GUIDE TO SALTA'S WINE REGION",
        greeting: `Welcome, ${safeName}!`,
        intro: "Thank you for subscribing to the Cafayate.com newsletter. You'll receive updates on:",
        bullets: [
          '<strong>Wine &amp; Bodegas</strong> — New releases, tastings, and winery news from the Calchaqu&iacute; Valleys',
          '<strong>Travel Tips</strong> — The best times to visit, where to stay, and what to see',
          '<strong>Local Culture</strong> — Events, festivals, and life in Cafayate',
          '<strong>Blog Posts</strong> — Stories and guides from our Cafayate Life series',
        ],
        cta: 'In the meantime, explore our latest content:',
        button: 'Read Our Blog',
        blogUrl: 'https://cafayate.com/en/pages/blog.html',
        sign: 'Cheers from Cafayate! 🍷',
        footer: 'A not-for-profit project supporting local charities',
        unsubscribe: 'To unsubscribe, reply to this email with "unsubscribe" in the subject line.',
      };

      await resend.emails.send({
        from: 'Cafayate.com <noreply@cafayate.com>',
        to: email,
        subject: welcome.subject,
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#333;">
            <div style="background:#1e6a3a;padding:24px 30px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;"><a href="https://cafayate.com" style="color:#fff;text-decoration:none;">CAFAYATE.COM</a></h1>
              <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;letter-spacing:1px;">${welcome.tagline}</p>
            </div>
            <div style="padding:30px;background:#fff;">
              <h2 style="font-family:Georgia,serif;color:#1e6a3a;margin-top:0;">${welcome.greeting}</h2>
              <p style="font-size:15px;line-height:1.7;color:#555;">${welcome.intro}</p>
              <ul style="font-size:15px;line-height:1.8;color:#555;padding-left:20px;">
                ${welcome.bullets.map(b => '<li>' + b + '</li>').join('')}
              </ul>
              <p style="font-size:15px;line-height:1.7;color:#555;">${welcome.cta}</p>
              <div style="margin:20px 0;">
                <a href="${welcome.blogUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:3px;font-size:15px;font-weight:600;">${welcome.button}</a>
              </div>
              <p style="font-size:15px;line-height:1.7;color:#555;">${welcome.sign}</p>
            </div>
            <div style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:3px solid #c0392b;">
              <p style="font-size:12px;color:#999;margin:0;">
                <a href="https://cafayate.com" style="color:#1e6a3a;">cafayate.com</a> — ${welcome.footer}
              </p>
              <p style="font-size:11px;color:#bbb;margin:8px 0 0;">${welcome.unsubscribe}</p>
            </div>
          </div>
        `,
      });
    } catch (welcomeErr) {
      console.error('Welcome email error:', welcomeErr);
      // Don't fail the subscription if welcome email fails
    }

    // 3. Notify site owner of new subscriber
    await resend.emails.send({
      from: 'Cafayate.com Newsletter <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[Cafayate.com] New subscriber: ${safeName}`,
      html: `
        <h2>New Newsletter Subscriber</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
        <p><strong>Language:</strong> ${subscriberLang === 'es' ? 'Spanish' : 'English'}</p>
        <p><strong>Date:</strong> ${new Date().toISOString()}</p>
        <hr>
        <p style="color:#999;font-size:12px;">Subscriber added to Resend audience. Welcome email sent automatically.</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Newsletter error:', err);
    return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
  }
};
