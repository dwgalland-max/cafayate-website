const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// --- Rate limiting (in-memory, resets on cold start) ---
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 2;            // max 2 submissions per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) {
    rateLimit[ip] = [];
  }
  // Remove entries older than the window
  rateLimit[ip] = rateLimit[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) {
    return true;
  }
  rateLimit[ip].push(now);
  return false;
}

// --- HTML sanitization ---
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Simple content heuristics ---
function looksLikeSpam(name, subject, message) {
  // Check for gibberish: high ratio of uppercase or no spaces in long strings
  const fields = [name, subject, message];
  for (const field of fields) {
    if (!field) continue;
    // Long string with no spaces is suspicious
    if (field.length > 20 && !field.includes(' ')) return true;
    // Mostly random characters (high uppercase ratio in short text)
    const upper = (field.match(/[A-Z]/g) || []).length;
    const lower = (field.match(/[a-z]/g) || []).length;
    if (field.length > 8 && upper > lower && upper > 4) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers — only allow submissions from cafayate.com
  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://cafayate.com', 'https://www.cafayate.com'];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { name, email, subject, message, website } = req.body;

    // --- Honeypot check ---
    // The "website" field is hidden and invisible to real users.
    // Bots auto-fill all fields, so if this has a value, it's a bot.
    if (website) {
      // Return fake success so the bot thinks it worked
      console.log('Honeypot triggered — bot blocked');
      return res.status(200).json({ success: true });
    }

    // --- Rate limiting ---
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many messages. Please wait a minute and try again.' });
    }

    // --- Validate required fields ---
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // --- Basic email format check ---
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    // --- Content spam check ---
    if (looksLikeSpam(name, subject, message)) {
      console.log('Spam content detected — blocked:', { name, subject });
      return res.status(200).json({ success: true }); // fake success
    }

    // --- Sanitize all user input before putting in HTML ---
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    // --- Send email via Resend ---
    const { data, error } = await resend.emails.send({
      from: 'Cafayate.com Contact <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      replyTo: email,
      subject: `[Cafayate.com] ${safeSubject}`,
      html: `
        <h2>New Contact Form Message</h2>
        <p><strong>From:</strong> ${safeName} (<a href="mailto:${safeEmail}">${safeEmail}</a>)</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <hr>
        <p>${safeMessage}</p>
        <hr>
        <p style="color:#999;font-size:12px;">Sent from the <a href="https://cafayate.com">cafayate.com</a> contact form</p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Failed to send message. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error. Please try again later.' });
  }
};
