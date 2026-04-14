const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth — require admin key as query param
  const key = req.query.key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!AUDIENCE_ID) {
    return res.status(500).json({ error: 'RESEND_AUDIENCE_ID not configured.' });
  }

  // DELETE — remove a subscriber by email
  if (req.method === 'DELETE') {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'email query param required.' });
    }
    try {
      const { data, error } = await resend.contacts.list({ audienceId: AUDIENCE_ID });
      if (error) return res.status(500).json({ error: 'Failed to fetch contacts.' });
      const contact = (data?.data || []).find(c => c.email === email);
      if (!contact) return res.status(404).json({ error: 'Subscriber not found.' });
      await resend.contacts.remove({ audienceId: AUDIENCE_ID, id: contact.id });
      return res.status(200).json({ success: true, removed: email });
    } catch (err) {
      console.error('Delete subscriber error:', err);
      return res.status(500).json({ error: 'Failed to remove subscriber.' });
    }
  }

  try {
    const { data, error } = await resend.contacts.list({ audienceId: AUDIENCE_ID });

    if (error) {
      console.error('Resend contacts error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscribers.' });
    }

    const contacts = data?.data || [];
    const active = contacts.filter(c => !c.unsubscribed);
    const unsubscribed = contacts.filter(c => c.unsubscribed);

    return res.status(200).json({
      total: contacts.length,
      active: active.length,
      unsubscribed: unsubscribed.length,
      subscribers: active.map(c => ({
        email: c.email,
        firstName: c.first_name,
        lastName: c.last_name,
        subscribedAt: c.created_at,
      })),
    });
  } catch (err) {
    console.error('Subscribers error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
