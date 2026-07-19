const express = require("express");
const sendEmail = require("../utils/sendEmail");
const { generalLimiter } = require("../middleware/rateLimiter");
const router = express.Router();

const ADMIN_EMAILS = ["vencomeltd@gmail.com", "bashayr.alharthi@outlook.com"];

// POST /api/contact — public contact form (Help & Support page)
router.post("/", generalLimiter, async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message)
    return res.status(400).json({ error: "name, email, subject and message are required" });

  try {
    await sendEmail({
      to: ADMIN_EMAILS,
      subject: `Contact form: ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <img src="https://vencome.com/VenCome.jpg" alt="VenCome" style="height:40px;margin-bottom:24px;" />
          <h2 style="color:#0A1628;">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 0;color:#666;">Name</td><td style="padding:8px 0;font-weight:700;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:700;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Subject</td><td style="padding:8px 0;font-weight:700;">${subject}</td></tr>
          </table>
          <p style="color:#666;">Message</p>
          <p style="white-space:pre-wrap;">${message}</p>
        </div>
      `,
    });

    res.status(201).json({ message: "Message sent" });
  } catch (err) {
    console.error("Contact form error:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
