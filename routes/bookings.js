const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const createNotification = require("../utils/notify");
const auth = require("../middleware/auth");
const sendEmail = require("../utils/sendEmail");
const User = require("../models/User");
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

    // 4. Check host-blocked dates
    const isBlocked = property.blockedDates?.some(({ start, end }) => {
      const blockStart = new Date(start);
      const blockEnd = new Date(end);
      return checkInDate < blockEnd && checkOutDate > blockStart;
    });

    if (isBlocked) {
      return res.status(409).json({ error: "These dates are unavailable" });
    }

    // 5. Check availability setting (weekdays / weekends / custom)
    if (property.availability && property.availability !== "all") {
      const days = [];
      const cursor = new Date(checkInDate);
      while (cursor < checkOutDate) {
        days.push(cursor.getDay()); // 0 = Sun, 6 = Sat
        cursor.setDate(cursor.getDate() + 1);
      }

      if (property.availability === "weekdays") {
        const hasWeekend = days.some((d) => d === 0 || d === 6);
        if (hasWeekend) {
          return res
            .status(409)
            .json({ error: "This space is only available on weekdays" });
        }
      }

      if (property.availability === "weekends") {
        const hasWeekday = days.some((d) => d >= 1 && d <= 5);
        if (hasWeekday) {
          return res
            .status(409)
            .json({ error: "This space is only available on weekends" });
        }
      }
    }

    // 4. Calculate total price
    let totalPrice = 0;
    let totalNights = 0;
    let totalHours = 0;

    // DAILY: number of nights × weekdayPrice
    if (property.pricing.pricingType === "DAILY") {
      const nights = Math.ceil(
        (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
      );
      totalNights = Math.max(nights, 1);

      const nightPrice = Number(property.pricing.weekdayPrice) || 0;
      if (nightPrice <= 0) {
        return res.status(400).json({ error: "DAILY price not configured" });
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
    if (property.pricing.pricingType === "DAILY") {
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
        property.pricing.pricingType === "DAILY" ? totalNights : undefined,
      totalHours:
        property.pricing.pricingType === "HOURLY"
          ? Number(totalHours.toFixed(2))
          : undefined,
      status: property.bookingSettings?.instantBook ? "confirmed" : "pending",
    });

    await booking.save();
    await booking.populate(["guest", "property", "host"]);

    if (booking.status === "confirmed") {
      await Property.findByIdAndUpdate(propertyId, {
        $push: {
          blockedDates: {
            start: checkInDate,
            end: checkOutDate,
            reason: "booked",
            bookingId: booking._id,
          },
        },
      });
    }

    const user = await User.findById(req.user.id);
    const displayName = user.displayName || user.firstName || "there";

    await createNotification(req.app.get("io"), {
      userId: property.host._id,
      type: "booking_request",
      title: "New Booking",
      body: `${displayName} booked ${property.title}`,
      link: `/bookings/${booking._id}`,
      meta: { bookingId: booking._id },
    });

    sendEmail({
      to: user.email,
      subject: "Your booking is confirmed 🎉",
      html: `
    <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

<!-- Header -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
  <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
</div>

<!-- Body -->
<div style="padding: 30px; color: #333;">
  <h2 style="color: #305CDE; text-align: center; margin-top: 0;">
    Booking Confirmed 🎉
  </h2>

  <p>Hi <strong>${displayName}</strong>,</p>

  <p>
    Great news! Your booking has been <strong>successfully confirmed</strong>.
  </p>

  <!-- Booking Summary -->
  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #666;">Property</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.title || "—"}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Location</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.location.city || ""}${
        property.location.country ? `, ${property.location.country}` : ""
      }
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Check-in</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${booking.checkIn.toLocaleDateString()}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Check-out</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${booking.checkOut.toLocaleDateString()}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Guests</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${booking.guests}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Total to be paid</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${booking.totalPrice}
        </td>
      </tr>
    </table>
  </div>

  <p>
    The host has been notified of your booking and may contact you with additional details before your stay.
  </p>

  <p>
    You can pay for, view or manage your booking anytime from your VenCome dashboard.
  </p>

  <p style="margin-bottom: 0;">
    We wish you a wonderful stay!
  </p>
</div>

<!-- Footer -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
  This is an automated message, please do not reply.<br />
  © ${new Date().getFullYear()} VenCome. All rights reserved.
</div>

  </div>
</div>
`,
    });
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

router.get("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(booking);
  } catch (err) {
    console.error("Fetch booking error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT: Host approve/decline
router.put("/:id/status", auth, async (req, res) => {
  const { status } = req.body;

  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      host: req.user.id,
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (!["confirmed", "declined"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const property = await Property.findById(booking.property);
    if (!property) return res.status(404).json({ error: "Property not found" });

    const previousStatus = booking.status;
    booking.status = status;
    await booking.save();

    if (status === "confirmed") {
      const updateOps = {};

      const alreadyBlocked = property.blockedDates.some(
        (b) => b.bookingId?.toString() === booking._id.toString()
      );

      if (!alreadyBlocked) {
        updateOps.$push = {
          blockedDates: {
            start: booking.checkIn,
            end: booking.checkOut,
            reason: "booked",
            bookingId: booking._id,
          },
        };
      }

      if (
        property.bookingSettings.approveFirstFive &&
        property.firstFiveApproved < 5
      ) {
        updateOps.$inc = { firstFiveApproved: 1 };
      }

      if (Object.keys(updateOps).length) {
        await Property.findByIdAndUpdate(booking.property, updateOps);
      }
    }

    // Only confirmed bookings block dates, so only unblock on confirmed → declined
    if (status === "declined" && previousStatus === "confirmed") {
      await Property.findByIdAndUpdate(booking.property, {
        $pull: { blockedDates: { bookingId: booking._id } },
      });
    }

    await booking.populate(["guest", "property"]);

    const io = req.app.get("io");
    const eventName =
      status === "confirmed" ? "bookingConfirmed" : "bookingDeclined";
    io.to(`guest_${booking.guest._id}`).emit(eventName, booking);
    io.to(`host_${req.user.id}`).emit(eventName, booking);

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ─── Refund policy helper ─────────────────────────────────────────────────────
// Returns { refundPercent: 0-100, reason: string }
function getRefundPolicy(policy, checkIn) {
  const now = new Date();
  const checkInDate = new Date(checkIn);
  const hoursUntilCheckIn = (checkInDate - now) / (1000 * 60 * 60);

  switch (policy) {
    case "flexible":
      // Full refund if cancelled more than 24hrs before check-in
      if (hoursUntilCheckIn > 24)
        return {
          refundPercent: 100,
          reason: "Cancelled within flexible policy (>24hrs)",
        };
      return {
        refundPercent: 0,
        reason: "Cancelled too close to check-in (flexible policy)",
      };

    case "moderate":
      // Full refund if cancelled more than 5 days before check-in
      if (hoursUntilCheckIn > 5 * 24)
        return {
          refundPercent: 100,
          reason: "Cancelled within moderate policy (>5 days)",
        };
      return {
        refundPercent: 0,
        reason: "Cancelled too close to check-in (moderate policy)",
      };

    case "strict":
      // 50% refund if cancelled more than 7 days before, none after
      if (hoursUntilCheckIn > 7 * 24)
        return {
          refundPercent: 50,
          reason: "Cancelled within strict policy (>7 days) — 50% refund",
        };
      return {
        refundPercent: 0,
        reason: "Cancelled too close to check-in (strict policy)",
      };

    case "non-refundable":
      return { refundPercent: 0, reason: "Non-refundable booking" };

    default:
      return { refundPercent: 0, reason: "No refund policy set" };
  }
}

// ─── Cancel booking ───────────────────────────────────────────────────────────
// DELETE /bookings/:id/cancel
// Accessible by: guest (own booking) or host (their property's booking)
router.delete("/:id/cancel", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("property");

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const isGuest = booking.guest.toString() === req.user.id;
    const isHost = booking.host.toString() === req.user.id;

    if (!isGuest && !isHost) {
      return res
        .status(403)
        .json({ error: "Not authorised to cancel this booking" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return res
        .status(400)
        .json({ error: `Booking is already ${booking.status}` });
    }

    const cancelledBy = isHost ? "host" : "guest";

    // ── Refund logic ──────────────────────────────────────────────────────────
    let refundAmount = 0;
    let refundPercent = 0;
    let refundReason = "No payment on record";
    let stripeRefund = null;

    const refundPolicy =
      booking.property?.bookingSettings?.refundPolicy || "non-refundable";
    const { refundPercent: pct, reason } = getRefundPolicy(
      refundPolicy,
      booking.checkIn
    );

    refundPercent = pct;
    refundReason = reason;

    // Hosts who cancel always give a full refund to the guest
    if (isHost && pct < 100) {
      refundPercent = 100;
      refundReason = "Host-initiated cancellation — full refund issued";
    }

    if (
      booking.paymentIntentId &&
      booking.totalPrice > 0 &&
      refundPercent > 0
    ) {
      refundAmount = Math.round(
        ((booking.totalPrice * refundPercent) / 100) * 100
      ); // in cents

      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: booking.paymentIntentId,
          amount: refundAmount, // partial or full
          reason: "requested_by_customer",
          metadata: {
            bookingId: booking._id.toString(),
            cancelledBy,
            policy: refundPolicy,
          },
        });
      } catch (stripeErr) {
        console.error("Stripe refund failed:", stripeErr.message);
        return res.status(502).json({
          error: "Cancellation recorded but Stripe refund failed",
          detail: stripeErr.message,
        });
      }
    }

    // ── Update booking ────────────────────────────────────────────────────────
    booking.status = "cancelled";
    booking.cancelledBy = cancelledBy;
    booking.cancelledAt = new Date();
    booking.refund = {
      percent: refundPercent,
      amount: refundAmount / 100, // back to £/$/€
      reason: refundReason,
      stripeRefundId: stripeRefund?.id || null,
      processedAt: stripeRefund ? new Date() : null,
    };
    await booking.save();

    // ── Unblock dates on property ─────────────────────────────────────────────
    await Property.findByIdAndUpdate(booking.property._id, {
      $pull: { blockedDates: { bookingId: booking._id } },
    });

    // ── Notify the other party via socket ─────────────────────────────────────
    const notifyUserId = isHost ? booking.guest : booking.host;
    req.app.get("io").to(`guest_${notifyUserId}`).emit("bookingCancelled", {
      bookingId: booking._id,
      cancelledBy,
      refundAmount: booking.refund.amount,
      refundPercent,
    });

    return res.json({
      message: "Booking cancelled successfully",
      booking,
      refund: booking.refund,
    });
  } catch (err) {
    console.error("Cancellation error:", err);
    return res.status(500).json({ error: "Failed to cancel booking" });
  }
});

router.get("/past", auth, async (req, res) => {
  // const bookings = await Booking.find({
  //   guest: req.user._id,
  //   checkOut: { $gt: new Date() },
  // })
  const bookings = await Booking.find({ guest: req.user.id })
    .populate("property", "title images coverImage location pricing")
    .sort({ checkOut: -1 });

  res.json(bookings);
});

module.exports = router;
