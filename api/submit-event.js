const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const SITE = 'https://cafayate.com';

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

  const key = req.query.key || req.body.key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { title_es, title_en, date, time, location, description_es, description_en, category, website } = req.body;

    if (!title_en || !date) {
      return res.status(400).json({ error: 'At minimum, title_en and date are required.' });
    }

    // Build the event object
    const event = {
      title_es: title_es || title_en,
      title_en: title_en,
      date: date,
      time: time || '',
      location: location || 'Cafayate',
      description_es: description_es || description_en || '',
      description_en: description_en || '',
      category: category || 'culture',
      website: website || '',
    };

    // Encode event as base64 for the approval URL
    const eventB64 = Buffer.from(JSON.stringify(event)).toString('base64url');
    const approveUrl = `${SITE}/api/approve-event?key=${ADMIN_KEY}&event=${eventB64}`;
    const rejectUrl = '#'; // Just don't click approve

    // Format date for display
    const eventDate = new Date(date + 'T12:00:00');
    const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Send approval email
    await resend.emails.send({
      from: 'Cafayate.com Events <noreply@cafayate.com>',
      to: 'dwgalland@gmail.com',
      subject: `[EVENT APPROVAL] ${event.title_en} — ${dateStr}`,
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#333;">
          <div style="background:#1e6a3a;padding:24px 30px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;">
              <a href="https://cafayate.com" style="color:#fff;text-decoration:none;">CAFAYATE.COM</a>
            </h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;letter-spacing:1px;">EVENT SUBMISSION</p>
          </div>
          <div style="padding:30px;background:#fff;">
            <div style="background:#fff3cd;border:2px solid #ffc107;border-radius:6px;padding:16px 20px;margin-bottom:24px;text-align:center;">
              <p style="font-size:15px;color:#333;margin:0 0 12px;font-weight:600;">
                📅 New event submitted for approval
              </p>
              <a href="${approveUrl}" style="display:inline-block;background:#1e6a3a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:15px;font-weight:600;">
                ✓ Approve &amp; Publish
              </a>
              <p style="font-size:12px;color:#999;margin:10px 0 0;">Ignore this email to skip this event.</p>
            </div>

            <h2 style="font-family:Georgia,serif;color:#1e6a3a;margin:0 0 16px;">Event Preview</h2>

            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:120px;border:1px solid #ddd;">Title (EN)</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.title_en}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Title (ES)</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.title_es}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Date</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Time</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.time || '—'}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Location</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.location}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Category</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.category}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;border:1px solid #ddd;">Website</td>
                <td style="padding:8px 12px;border:1px solid #ddd;">${event.website ? '<a href="' + event.website + '">' + event.website + '</a>' : '—'}</td>
              </tr>
            </table>

            <div style="margin-bottom:16px;">
              <strong style="color:#555;">Description (EN):</strong>
              <p style="font-size:14px;line-height:1.6;color:#555;margin:6px 0;">${event.description_en || '—'}</p>
            </div>
            <div>
              <strong style="color:#555;">Description (ES):</strong>
              <p style="font-size:14px;line-height:1.6;color:#555;margin:6px 0;">${event.description_es || '—'}</p>
            </div>
          </div>
          <div style="background:#f5f5f5;padding:16px 30px;text-align:center;border-top:3px solid #c0392b;">
            <p style="font-size:12px;color:#999;margin:0;">
              Click "Approve &amp; Publish" above to add this event to <a href="https://cafayate.com" style="color:#1e6a3a;">cafayate.com</a>
            </p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: 'Approval email sent. Click the approve link in the email to publish this event.',
      event: event,
    });
  } catch (err) {
    console.error('Submit event error:', err);
    return res.status(500).json({ error: 'Failed to submit event: ' + err.message });
  }
};
