const express = require("express");
const PlatformReview = require("../models/PlatformReview");
const Booking = require("../models/Booking");
const auth = require("../middleware/auth");
const router = express.Router();

// POST: submit a review of VenCome itself (one per user)
router.post("/", auth, async (req, res) => {
  try {
    const { rating, comment, bookingId } = req.body;
    if (!rating) return res.status(400).json({ error: "Rating is required" });

    const existing = await PlatformReview.findOne({ user: req.user.id });
    if (existing) return res.status(409).json({ error: "You've already reviewed VenCome" });

    const review = await PlatformReview.create({
      user: req.user.id,
      booking: bookingId || undefined,
      rating,
      comment,
    });

    res.status(201).json(review);
  } catch (err) {
    console.error("Platform review error:", err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// GET: whether to prompt the logged-in user for a platform review — shown
// right after their first booking is confirmed, once, ever
router.get("/should-prompt", auth, async (req, res) => {
  try {
    const existing = await PlatformReview.findOne({ user: req.user.id });
    if (existing) return res.json({ shouldPrompt: false });

    const bookingCount = await Booking.countDocuments({ guest: req.user.id });
    res.json({ shouldPrompt: bookingCount <= 1 });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET: public, latest platform reviews for the homepage
router.get("/", async (req, res) => {
  try {
    const reviews = await PlatformReview.find({ comment: { $exists: true, $ne: "" } })
      .populate("user", "firstName lastName displayName profileImage")
      .sort({ createdAt: -1 })
      .limit(12);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
