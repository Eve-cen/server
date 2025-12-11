const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// POST: Create booking (guest)router.post("/", auth, async (req, res) => {
router.post("/", auth, async (req, res) => {
  const { propertyId, checkIn, checkOut, guests, extras = [] } = req.body;
  const guestId = req.user.id;

  try {
    const property = await Property.findById(propertyId).populate("host");
    if (!property) return res.status(404).json({ error: "Property not found" });

    const fullCheckIn = new Date(checkIn);
    const fullCheckOut = new Date(checkOut);

    if (fullCheckOut <= fullCheckIn) {
      return res.status(400).json({ error: "Invalid booking time" });
    }

    const nights =
      property.pricing.pricingType === "NIGHTLY"
        ? Math.max(Math.ceil((fullCheckOut - fullCheckIn) / 86400000), 1)
        : undefined;

    const totalHours =
      property.pricing.pricingType === "HOURLY"
        ? (fullCheckOut - fullCheckIn) / (1000 * 60 * 60)
        : undefined;

    let total = 0;

    if (property.pricing.pricingType === "HOURLY") {
      const milliseconds = fullCheckOut - fullCheckIn;
      const totalHours = Math.max(0, milliseconds / (1000 * 60 * 60));

      if (totalHours <= 0)
        return res.status(400).json({ error: "Invalid hourly booking time" });

      total = (property.pricing.hourlyPrice || 0) * totalHours;
    }

    if (property.pricing.pricingType === "NIGHTLY") {
      const nights = Math.ceil((fullCheckOut - fullCheckIn) / 86400000) || 1; // minimum 1 night
      total = (property.pricing.weekdayPrice || 0) * nights;
    }

    const selectedExtras = property.extras.filter((e) =>
      extras.includes(e.name)
    );
    selectedExtras.forEach((e) => (total += e.price));

    let discount = 0;
    if (property.pricing.pricingType === "NIGHTLY") {
      if (property.pricing.discounts.newListing) discount += total * 0.2;
      if (property.pricing.discounts.lastMinute && nights === 1)
        discount += total * 0.01;
      if (property.pricing.discounts.weekly && nights >= 7)
        discount += total * 0.1;
      if (property.pricing.discounts.monthly && nights >= 30)
        discount += total * 0.2;
    }

    total = Math.round((total - discount) * 100) / 100;

    const booking = new Booking({
      property: propertyId,
      guest: guestId,
      host: property.host._id,
      checkIn: fullCheckIn,
      checkOut: fullCheckOut,
      guests,
      extras: selectedExtras,
      totalPrice: total,
      discountApplied: discount,
      totalHours,
      totalNights: nights,
    });

    if (property.bookingSettings.instantBook) booking.status = "confirmed";

    await booking.save();
    await booking.populate(["guest", "property", "host"]);

    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Host's bookings
router.get("/host", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ host: req.user.id })
      .populate("property", "title coverImage")
      .populate("guest", "name profileImage")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Guest's bookings
router.get("/", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ guest: req.user.id })
      .populate("property", "title coverImage")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PUT: Host approve/decline
router.put("/:id/status", auth, async (req, res) => {
  const { status } = req.body; // 'confirmed' or 'declined'
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      host: req.user.id,
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (!["confirmed", "declined"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    booking.status = status;
    await booking.save();

    // Auto-approve future bookings after 5
    if (status === "confirmed") {
      const property = await Property.findById(booking.property);
      if (
        property.bookingSettings.approveFirstFive &&
        property.firstFiveApproved < 5
      ) {
        property.firstFiveApproved += 1;
        await property.save();
      }
    }

    await booking.populate(["guest", "property"]);
    req.app
      .get("io")
      .to(`guest_${booking.guest._id}`)
      .emit("bookingUpdate", booking);

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
