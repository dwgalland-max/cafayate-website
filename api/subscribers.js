const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'PATCH' && req.method !== 'POST') {
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

  // PATCH — update an existing subscriber (e.g., change language). Body: { email, lang, firstName? }
  if (req.method === 'PATCH') {
    const email = req.query.email || (req.body && req.body.email);
    const lang = req.query.lang || (req.body && req.body.lang);
    const firstName = req.query.firstName || (req.body && req.body.firstName);
    if (!email) return res.status(400).json({ error: 'email is required.' });
    try {
      const { data, error } = await resend.contacts.list({ audienceId: AUDIENCE_ID });
      if (error) return res.status(500).json({ error: 'Failed to fetch contacts.' });
      const contact = (data?.data || []).find(c => c.email === email);
      if (!contact) return res.status(404).json({ error: 'Subscriber not found.' });
      const updates = {};
      if (lang === 'en' || lang === 'es') updates.lastName = lang;
      if (firstName) updates.firstName = firstName;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update. Provide lang and/or firstName.' });
      await resend.contacts.update({ audienceId: AUDIENCE_ID, id: contact.id, ...updates });
      return res.status(200).json({ success: true, email, updates });
    } catch (err) {
      console.error('Update subscriber error:', err);
      return res.status(500).json({ error: 'Failed to update: ' + err.message });
    }
  }

  // POST — add a subscriber directly (admin-only path, bypasses the public form). Body: { email, firstName, lang }
  if (req.method === 'POST') {
    const email = (req.body && req.body.email) || req.query.email;
    const firstName = (req.body && req.body.firstName) || req.query.firstName || '';
    const lang = (req.body && req.body.lang) || req.query.lang || 'en';
    if (!email) return res.status(400).json({ error: 'email is required.' });
    try {
      await resend.contacts.create({
        audienceId: AUDIENCE_ID,
        email: email,
        firstName: firstName,
        lastName: lang === 'es' ? 'es' : 'en',
        unsubscribed: false,
      });
      return res.status(200).json({ success: true, email, lang, firstName });
    } catch (err) {
      console.error('Create subscriber error:', err);
      return res.status(500).json({ error: err.message });
    }
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
