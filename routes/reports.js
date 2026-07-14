const express = require("express");
const Report = require("../models/Report");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const sendEmail = require("../utils/sendEmail");
const auth = require("../middleware/auth");
const { generalLimiter } = require("../middleware/rateLimiter");
const router = express.Router();

const ADMIN_EMAILS = ["vencomeltd@gmail.com", "bashayr.alharthi@outlook.com"];

// POST /api/reports
// Doubles as VenCome's self-service dispute flow: a guest or host raising a
// dispute on a booking (type: "booking") freezes that booking's escrow
// release, same as a real Stripe chargeback does (see
// routes/paymentsWebhook.js's charge.dispute.created handler) -- so a
// self-reported dispute can't have its payout auto-released out from under
// admin review before it's looked at.
router.post("/", auth, generalLimiter, async (req, res) => {
  const { type, targetId, reason, description } = req.body;
  if (!type || !targetId || !reason)
    return res.status(400).json({ error: "type, targetId and reason are required" });

  try {
    // Prevent duplicate reports
    const existing = await Report.findOne({ reporter: req.user.id, type, targetId });
    if (existing) return res.status(409).json({ error: "You have already reported this" });

    let booking = null;
    if (type === "booking") {
      booking = await Booking.findById(targetId).populate("property", "title host");
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const property = booking.property?._id
        ? booking.property
        : await Property.findById(booking.property);

      const isGuest = booking.guest?.toString() === req.user.id;
      const isHost = property?.host?.toString() === req.user.id;
      if (!isGuest && !isHost) {
        return res.status(403).json({ error: "You can only raise a dispute on your own booking" });
      }

      booking.disputeFrozen = true;
      await booking.save();
    }

    const report = await Report.create({ reporter: req.user.id, type, targetId, reason, description });

    if (type === "booking") {
      sendEmail({
        to: ADMIN_EMAILS,
        subject: `⚠️ Self-reported booking dispute${booking?.property?.title ? `: ${booking.property.title}` : ""}`,
        html: `
          <p><strong>Booking:</strong> ${booking._id}</p>
          <p><strong>Reported by:</strong> ${req.user.id}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Description:</strong> ${description || "(none provided)"}</p>
          <p>Escrow release for this booking has been frozen automatically. Review in the admin Disputes tab.</p>
        `,
      }).catch((err) => console.error("Failed to send dispute admin email:", err.message));
    }

    res.status(201).json({ message: "Report submitted. Our team will review it shortly.", report });
  } catch (err) {
    console.error("Report creation error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/reports/my — user's own submitted reports
router.get("/my", auth, async (req, res) => {
  try {
    const reports = await Report.find({ reporter: req.user.id }).sort({ createdAt: -1 });
    res.json(reports);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
