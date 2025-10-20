const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// Get past trips (GET /api/bookings/past)
router.get("/past", auth, async (req, res) => {
  try {
    const pastBookings = await Booking.find({
      user: req.user.id,
      checkOut: { $lt: new Date() }, // Past trips only
    })
      .populate("property", "title location price image")
      .sort({ checkOut: -1 });

    res.json(pastBookings);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update reviewed status (PUT /api/bookings/:id/reviewed)
router.put("/:id/reviewed", auth, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { reviewed: true },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Existing endpoint (POST /api/bookings) remains unchanged...
router.post("/", auth, async (req, res) => {
  const { propertyId, checkIn, checkOut } = req.body;
  try {
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ error: "Property not found" });

    const nights = Math.ceil(
      (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
    );
    if (nights <= 0)
      return res
        .status(400)
        .json({ error: "Check-out date must be after check-in date" });

    const totalPrice = property.price * nights;

    const booking = new Booking({
      property: propertyId,
      user: req.user.id,
      checkIn,
      checkOut,
      totalPrice,
    });

    const savedBooking = await booking.save();
    res.status(201).json(savedBooking);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
