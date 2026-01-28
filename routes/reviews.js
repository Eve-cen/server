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
      status: "confirmed",
      checkOut: { $lt: new Date() }, // ✅ AFTER checkout
      completed: true,
      reviewed: false,
    });

    if (!booking) {
      return res.status(403).json({
        error:
          "You can only review confirmed, completed, and not-yet-reviewed bookings after checkout",
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

module.exports = router;
