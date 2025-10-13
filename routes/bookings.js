const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// Create a new booking (POST /api/bookings)
router.post("/", auth, async (req, res) => {
  const { propertyId, checkIn, checkOut } = req.body;

  try {
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    const nights = Math.ceil(
      (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
    );
    if (nights <= 0) {
      return res
        .status(400)
        .json({ error: "Check-out date must be after check-in date" });
    }

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
