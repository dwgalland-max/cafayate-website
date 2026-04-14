// Temporary endpoint to fetch the Resend audience ID — DELETE after use
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  try {
    const { data, error } = await resend.audiences.list();
    if (error) return res.status(500).json({ error });
    return res.status(200).json({ audiences: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
