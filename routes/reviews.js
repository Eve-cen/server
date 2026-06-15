const express = require("express");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();
const updatePropertyRating = require("../utils/updatePropertyRating");

router.post("/", auth, async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    const booking = await Booking.findOne({
      _id: bookingId,
      guest: req.user.id,
      status: { $in: ["confirmed", "completed"] },
      checkOut: { $lt: new Date() },
      reviewed: false,
    });

    if (!booking) {
      return res.status(403).json({
        error: "You can only review bookings after checkout that have not been reviewed yet.",
      });
    }

    const review = await Review.create({
      booking: bookingId,
      guest: req.user.id,
      user: req.user.id,
      property: booking.property,
      rating,
      comment,
    });

    booking.reviewed = true;
    booking.review = review._id;
    await booking.save();

    // Update property average rating
    await updatePropertyRating(booking.property);

    res.status(201).json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

router.get("/:id/can-review", auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      guest: req.user.id,
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const now = new Date();
    const canReview =
      booking.status === "confirmed" &&
      booking.checkOut < now &&
      booking.completed === true &&
      booking.reviewed === false;

    res.json({ canReview, booking });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Reviews left by the current user (customer)
router.get("/my-reviews", auth, async (req, res) => {
  try {
    const reviews = await Review.find({ guest: req.user.id })
      .populate("property", "title coverImage location")
      .populate("booking", "checkIn checkOut")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error("Get my reviews error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Reviews received by host on their properties
router.get("/host-reviews", auth, async (req, res) => {
  try {
    const reviews = await Review.find({ host: req.user.id })
      .populate("property", "title coverImage")
      .populate("guest", "firstName lastName displayName profileImage")
      .populate("booking", "checkIn checkOut")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error("Get host reviews error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
