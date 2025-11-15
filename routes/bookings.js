// const express = require("express");
// const Booking = require("../models/Booking");
// const Property = require("../models/Property");
// const auth = require("../middleware/auth");
// const router = express.Router();

// // Get past trips (GET /api/bookings/past)
// router.get("/past", auth, async (req, res) => {
//   try {
//     const pastBookings = await Booking.find({
//       user: req.user.id,
//       checkOut: { $lt: new Date() }, // Past trips only
//     })
//       .populate("property", "title location price image")
//       .sort({ checkOut: -1 });

//     res.json(pastBookings);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // Update reviewed status (PUT /api/bookings/:id/reviewed)
// router.put("/:id/reviewed", auth, async (req, res) => {
//   try {
//     const booking = await Booking.findOneAndUpdate(
//       { _id: req.params.id, user: req.user.id },
//       { reviewed: true },
//       { new: true }
//     );
//     if (!booking) return res.status(404).json({ error: "Booking not found" });
//     res.json(booking);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // Existing endpoint (POST /api/bookings) remains unchanged...
// router.post("/", auth, async (req, res) => {
//   const { propertyId, checkIn, checkOut } = req.body;
//   try {
//     const property = await Property.findById(propertyId);
//     if (!property) return res.status(404).json({ error: "Property not found" });

//     const nights = Math.ceil(
//       (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
//     );
//     if (nights <= 0)
//       return res
//         .status(400)
//         .json({ error: "Check-out date must be after check-in date" });

//     const totalPrice = property.price * nights;

//     const booking = new Booking({
//       property: propertyId,
//       user: req.user.id,
//       checkIn,
//       checkOut,
//       totalPrice,
//     });

//     const savedBooking = await booking.save();
//     res.status(201).json(savedBooking);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// module.exports = router;

const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// POST: Create booking (guest)
router.post("/", auth, async (req, res) => {
  const { propertyId, checkIn, checkOut, guests, extras } = req.body;
  const guestId = req.user.id;

  try {
    const property = await Property.findById(propertyId).populate("host");
    if (!property) return res.status(404).json({ error: "Property not found" });

    const nights = Math.ceil(
      (new Date(checkOut) - new Date(checkIn)) / 86400000
    );
    if (nights <= 0) return res.status(400).json({ error: "Invalid dates" });

    // Base price
    let total = property.pricing.weekdayPrice * nights;

    // Apply extras
    const selectedExtras = property.extras.filter((e) =>
      extras.includes(e.name)
    );
    selectedExtras.forEach((e) => (total += e.price));

    // Apply discounts
    let discount = 0;
    if (property.pricing.discounts.newListing) discount += total * 0.2;
    if (property.pricing.discounts.lastMinute && nights === 1)
      discount += total * 0.01;
    if (property.pricing.discounts.weekly && nights >= 7)
      discount += total * 0.1;
    if (property.pricing.discounts.monthly && nights >= 30)
      discount += total * 0.2;

    total = Math.round((total - discount) * 100) / 100;

    const booking = new Booking({
      property: propertyId,
      guest: guestId,
      host: property.host._id,
      checkIn,
      checkOut,
      guests,
      extras: selectedExtras,
      totalPrice: total,
      discountApplied: discount,
    });

    // Check booking settings
    if (property.bookingSettings.instantBook) {
      booking.status = "confirmed";
      if (
        property.bookingSettings.approveFirstFive &&
        property.firstFiveApproved < 5
      ) {
        booking.status = "pending";
      }
    }

    await booking.save();

    // Increment firstFiveApproved if confirmed
    if (
      booking.status === "confirmed" &&
      property.bookingSettings.approveFirstFive &&
      property.firstFiveApproved < 5
    ) {
      property.firstFiveApproved += 1;
      await property.save();
    }

    await booking.populate(["guest", "property", "host"]);

    // Notify host via Socket.IO
    // req.app
    //   .get("io")
    //   .to(`host_${property.host._id}`)
    //   .emit("newBooking", booking);

    res.status(201).json(booking);
  } catch (err) {
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
