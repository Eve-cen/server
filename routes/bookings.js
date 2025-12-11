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
    // 1. Find active/published property
    const property = await Property.findOne({
      _id: propertyId,
    }).populate("host");

    if (!property) {
      return res
        .status(404)
        .json({ error: "Property not found or unavailable" });
    }

    // 2. Parse and validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (checkOutDate <= checkInDate) {
      return res
        .status(400)
        .json({ error: "Check-out must be after check-in" });
    }

    if (checkOutDate < new Date()) {
      return res.status(400).json({ error: "Cannot book in the past" });
    }

    // 3. Prevent double booking
    const conflict = await Booking.findOne({
      property: propertyId,
      status: { $in: ["confirmed", "pending"] },
      checkIn: { $lt: checkOutDate },
      checkOut: { $gt: checkInDate },
    });

    if (conflict) {
      return res.status(409).json({ error: "These dates are already booked" });
    }

    // 4. Calculate total price
    let totalPrice = 0;
    let totalNights = 0;
    let totalHours = 0;

    // NIGHTLY: number of nights × weekdayPrice
    if (property.pricing.pricingType === "NIGHTLY") {
      const nights = Math.ceil(
        (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
      );
      totalNights = Math.max(nights, 1);

      const nightPrice = Number(property.pricing.weekdayPrice) || 0;
      if (nightPrice <= 0) {
        return res.status(400).json({ error: "Nightly price not configured" });
      }

      totalPrice = totalNights * nightPrice;
    }

    // HOURLY: total hours (even over multiple days) × hourlyPrice
    else if (property.pricing.pricingType === "HOURLY") {
      totalHours = (checkOutDate - checkInDate) / (1000 * 60 * 60); // decimal hours

      if (totalHours < 1) {
        return res.status(400).json({ error: "Minimum 1 hour required" });
      }

      const hourPrice = Number(property.pricing.hourlyPrice) || 0;
      if (hourPrice <= 0) {
        return res.status(400).json({ error: "Hourly price not configured" });
      }

      // Choose one:
      totalPrice = totalHours * hourPrice; // exact hours (e.g. 9.5h allowed)
      // totalPrice = Math.ceil(totalHours) * hourPrice; // round up to full hour
    } else {
      return res.status(400).json({ error: "Invalid pricing type" });
    }

    // 5. Add extras
    const validExtras = Array.isArray(property.extras) ? property.extras : [];
    const selectedExtras = validExtras.filter((e) => extras.includes(e.name));
    const extrasTotal = selectedExtras.reduce(
      (sum, e) => sum + (Number(e.price) || 0),
      0
    );
    totalPrice += extrasTotal;

    // 6. Apply discounts (optional)
    let discount = 0;
    if (property.pricing.pricingType === "NIGHTLY") {
      if (property.pricing.discounts?.newListing) discount += totalPrice * 0.2;
      if (totalNights >= 7 && property.pricing.discounts?.weekly)
        discount += totalPrice * 0.1;
      if (totalNights >= 30 && property.pricing.discounts?.monthly)
        discount += totalPrice * 0.2;
    }
    totalPrice = Math.round((totalPrice - discount) * 100) / 100;

    // Final safety
    if (isNaN(totalPrice) || totalPrice < 0) totalPrice = 0;

    // 7. Create booking
    const booking = new Booking({
      property: propertyId,
      guest: guestId,
      host: property.host._id,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: guests || 1,
      extras: selectedExtras,
      totalPrice,
      discountApplied: Math.round(discount * 100) / 100,
      totalNights:
        property.pricing.pricingType === "NIGHTLY" ? totalNights : undefined,
      totalHours:
        property.pricing.pricingType === "HOURLY"
          ? Number(totalHours.toFixed(2))
          : undefined,
      status: property.bookingSettings?.instantBook ? "confirmed" : "pending",
    });

    await booking.save();
    await booking.populate(["guest", "property", "host"]);

    return res.status(201).json(booking);
  } catch (err) {
    console.error("Booking creation failed:", err);
    return res.status(500).json({ error: "Failed to create booking" });
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
