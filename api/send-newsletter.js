const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const key = req.query.key || req.body.key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!AUDIENCE_ID) {
    return res.status(500).json({ error: 'RESEND_AUDIENCE_ID not configured.' });
  }

  const { subject, html, preview } = req.body;

  if (!subject || !html) {
    return res.status(400).json({ error: 'subject and html fields are required.' });
  }

  try {
    // Fetch all active subscribers
    const { data: contactsData, error: contactsError } = await resend.contacts.list({
      audienceId: AUDIENCE_ID,
    });

    if (contactsError) {
      console.error('Contacts error:', contactsError);
      return res.status(500).json({ error: 'Failed to fetch subscriber list.' });
    }

    const contacts = contactsData?.data || [];
    const active = contacts.filter(c => !c.unsubscribed);

    if (active.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No active subscribers.' });
    }

    // Preview mode — send only to admin
    if (preview) {
      await resend.emails.send({
        from: 'Cafayate.com <noreply@cafayate.com>',
        to: 'dwgalland@gmail.com',
        subject: `[PREVIEW] ${subject}`,
        html: wrapNewsletter(subject, html),
      });
      return res.status(200).json({
        success: true,
        preview: true,
        message: `Preview sent to dwgalland@gmail.com. ${active.length} subscribers would receive this.`,
      });
    }

    // Send to all active subscribers (batch in groups of 50)
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
          html: wrapNewsletter(subject, html, contact.first_name),
        })
          .then(() => { sent++; })
          .catch(err => {
            errors.push({ email: contact.email, error: err.message });
          })
      );
      await Promise.all(promises);
    }

    // Notify admin of send results
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

    return res.status(200).json({
      success: true,
      sent,
      total: active.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Send newsletter error:', err);
    return res.status(500).json({ error: 'Failed to send newsletter.' });
  }
};

// Wrap newsletter content in branded template
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
