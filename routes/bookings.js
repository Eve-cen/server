const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const createNotification = require("../utils/notify");
const auth = require("../middleware/auth");
const sendEmail = require("../utils/sendEmail");
const User = require("../models/User");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const { randomUUID } = require("crypto");
const uploadToR2 = require("../utils/uploadService");

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"), false);
    }
    cb(null, true);
  },
});

router.post(
  "/",
  auth,
  (req, res, next) => {
    uploadPdf.single("licensePdf")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    const extras = JSON.parse(req.body.extras || "[]");
    const { propertyId, checkIn, checkOut, guests } = req.body;
    const guestId = req.user.id;

    // 1. Find property
    const property = await Property.findOne({ _id: propertyId }).populate(
      "host"
    );

    if (!property) {
      return res
        .status(404)
        .json({ error: "Property not found or unavailable" });
    }

    // ✅ CATEGORY CHECK BEFORE ANY PDF UPLOAD
    if (req.file && property.category === "Medical Rooms") {
      // delete uploaded temp file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(400).json({
        error: "License PDF is only allowed for Medical Rooms properties",
      });
    }

    // 2. Upload PDF to R2 (ONLY if allowed)
    let licensePdfUrl = null;

    if (req.file && property.category === "Medical Rooms") {
      try {
        const result = await uploadToR2(req.file.path, req.file.filename);
        licensePdfUrl = result.location;
      } catch (uploadErr) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: "Failed to upload license PDF" });
      }
    }

    try {
      // 1. Find property
      const property = await Property.findOne({ _id: propertyId }).populate(
        "host"
      );
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
        return res
          .status(409)
          .json({ error: "These dates are already booked" });
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

      // 5. Check availability setting
      if (property.availability && property.availability !== "all") {
        const days = [];
        const cursor = new Date(checkInDate);
        while (cursor < checkOutDate) {
          days.push(cursor.getDay());
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

      // 6. Calculate total price
      let totalPrice = 0;
      let totalNights = 0;
      let totalHours = 0;

      const pricingType = property.pricing.pricingType || "DAILY";

      // Resolve daily price from either field
      const dailyPrice = Number(property.pricing.weekdayPrice) ||
                         Number(property.pricing.daily) || 0;

      // Resolve hourly price from either field
      const hourlyPrice = Number(property.pricing.hourlyPrice) ||
                          Number(property.pricing.hourly) || 0;

      // Auto-detect pricing type if not explicitly set
      const effectivePricingType = (() => {
        if (property.pricing.pricingType === "HOURLY") return "HOURLY";
        if (property.pricing.pricingType === "DAILY") {
          // If daily price exists use DAILY, else fall back to HOURLY
          return dailyPrice > 0 ? "DAILY" : hourlyPrice > 0 ? "HOURLY" : "DAILY";
        }
        // No pricingType set — detect from available prices
        if (dailyPrice > 0) return "DAILY";
        if (hourlyPrice > 0) return "HOURLY";
        return "DAILY";
      })();

      if (effectivePricingType === "DAILY") {
        const nights = Math.ceil(
          (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
        );
        totalNights = Math.max(nights, 1);
        if (dailyPrice <= 0) {
          return res.status(400).json({ error: "Daily price not configured for this space" });
        }
        totalPrice = totalNights * dailyPrice;
      } else if (effectivePricingType === "HOURLY") {
        totalHours = (checkOutDate - checkInDate) / (1000 * 60 * 60);
        if (totalHours < 1) {
          return res.status(400).json({ error: "Minimum 1 hour required" });
        }
        if (hourlyPrice <= 0) {
          return res.status(400).json({ error: "Hourly price not configured for this space" });
        }
        totalPrice = totalHours * hourlyPrice;
      } else {
        return res.status(400).json({ error: "Invalid pricing type" });
      }

      // 7. Add extras
      const validExtras = Array.isArray(property.extras) ? property.extras : [];
      const selectedExtras = validExtras.filter((e) => extras.includes(e.name));
      const extrasTotal = selectedExtras.reduce(
        (sum, e) => sum + (Number(e.price) || 0),
        0
      );
      totalPrice += extrasTotal;

      // 8. Apply discounts
      let discount = 0;
      if (property.pricing.pricingType === "DAILY") {
        if (property.pricing.discounts?.newListing)
          discount += totalPrice * 0.2;
        if (totalNights >= 7 && property.pricing.discounts?.weekly)
          discount += totalPrice * 0.1;
        if (totalNights >= 30 && property.pricing.discounts?.monthly)
          discount += totalPrice * 0.2;
      }
      totalPrice = Math.round((totalPrice - discount) * 100) / 100;
      if (isNaN(totalPrice) || totalPrice < 0) totalPrice = 0;

      // 9. Create booking
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
        licensePdfUrl,
      });

      await booking.save();
      await booking.populate(["guest", "property", "host"]);

      // 10. Block dates if instantly confirmed
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

      // 11. Notify host
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

      // 12. Send confirmation email
      sendEmail({
        to: user.email,
        subject: booking.status === "confirmed" ? "Your booking is confirmed 🎉" : "Your booking request has been received",
        html: `
          <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
                <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
              </div>
              <div style="padding: 30px; color: #333;">
                <h2 style="color: #305CDE; text-align: center; margin-top: 0;">
                  ${booking.status === "confirmed" ? "Booking Confirmed 🎉" : "Booking Request Received 📋"}
                </h2>
                <p>Hi <strong>${displayName}</strong>,</p>
                <p>${booking.status === "confirmed" 
                  ? "Great news! Your booking has been <strong>successfully confirmed</strong>."
                  : "We've received your booking request. The host will review and respond within 24 hours."
                }</p>
                <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Property</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        property.title || "—"
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Location</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        property.location?.city || ""
                      }${
          property.location?.country ? `, ${property.location.country}` : ""
        }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Check-in</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${booking.checkIn.toLocaleDateString()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Check-out</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${booking.checkOut.toLocaleDateString()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Guests</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        booking.guests
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Total to be paid</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">£${
                        booking.totalPrice
                      }</td>
                    </tr>
                  </table>
                </div>
                ${booking.status === "pending" ? `
                <div style="background-color: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; color: #92400E; font-size: 14px;">
                    ⏳ <strong>Awaiting host approval</strong> — You will not be charged until the host approves your request.
                  </p>
                </div>
                ` : ''}
                <p>The host has been notified and may contact you with additional details before your stay.</p>
                <p>You can view or manage your booking anytime from your VenCome dashboard.</p>
                <p style="margin-bottom: 0;">We wish you a wonderful stay!</p>
              </div>
              <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                This is an automated message, please do not reply.<br />
                © ${new Date().getFullYear()} VenCome. All rights reserved.
              </div>
            </div>
          </div>
        `,
      });

      const hostUser = await User.findById(property.host._id);

      if (hostUser) {
        const hostDisplayName = hostUser.displayName || hostUser.firstName || "there";
        const guestDisplayName = user.displayName || user.firstName || "A guest";

        sendEmail({
          to: hostUser.email,
          subject: `New booking request for ${property.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="background-color: #0A1628; padding: 24px; text-align: center;">
                  <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 140px;">
                </div>
                <div style="padding: 30px; color: #333;">
                  <h2 style="color: #0A1628; text-align: center; margin-top: 0;">
                    ${booking.status === "confirmed" ? "New Booking Confirmed" : "New Booking Request"}
                  </h2>
                  <p>Hi <strong>${hostDisplayName}</strong>,</p>
                  <p>
                    ${
                      booking.status === "confirmed"
                        ? `<strong>${guestDisplayName}</strong> has instantly booked your space.`
                        : `<strong>${guestDisplayName}</strong> has requested to book your space. Please log in to approve or decline.`
                    }
                  </p>
                  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Property</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${property.title}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Guest</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${guestDisplayName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Check-in</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${booking.checkIn.toLocaleDateString()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Check-out</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${booking.checkOut.toLocaleDateString()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Total</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600;">£${booking.totalPrice}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666;">Status</td>
                        <td style="padding: 6px 0; text-align: right; font-weight: 600; color: ${
                          booking.status === "confirmed" ? "#16A34A" : "#D97706"
                        };">
                          ${booking.status === "confirmed" ? "Confirmed" : "Pending Approval"}
                        </td>
                      </tr>
                    </table>
                  </div>
                  ${
                    booking.status === "pending"
                      ? `
                  <div style="text-align: center; margin: 24px 0;">
                    <a href="https://vencome.netlify.app/dashboard/bookings" style="background: #0A1628; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                      Review Booking Request
                    </a>
                  </div>
                  `
                      : ""
                  }
                  <p style="margin-bottom: 0; color: #6B7280; font-size: 13px;">
                    You can manage all your bookings from your VenCome host dashboard.
                  </p>
                </div>
                <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                  This is an automated message, please do not reply.<br />
                  © ${new Date().getFullYear()} VenCome. All rights reserved.
                </div>
              </div>
            </div>
          `,
        });
      }

      return res.status(201).json(booking);
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      console.error("Booking creation failed:", err.message, err.stack);
      return res.status(500).json({ error: err.message });
    }
  }
);

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

router.get("/past", auth, async (req, res) => {
  // const bookings = await Booking.find({
  //   guest: req.user._id,
  //   checkOut: { $gt: new Date() },
  // })
  const bookings = await Booking.find({ guest: req.user._id })
    .populate("property", "title images coverImage location pricing")
    .sort({ checkOut: -1 });

  res.json(bookings);
});

// GET: pending bookings count for the logged-in user (host or guest)
router.get("/pending-count", auth, async (req, res) => {
  try {
    const count = await Booking.countDocuments({
      $or: [{ host: req.user.id }, { guest: req.user.id }],
      status: "pending",
    });
    res.json({ success: true, pendingCount: count });
  } catch (err) {
    console.error("Error fetching pending bookings count:", err);
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

// ====================== MULTER SETUP ======================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const uploadLease = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only PDF, DOC, and DOCX files are allowed!"), false);
    }
    cb(null, true);
  },
});

// ====================== HELPERS ======================

/**
 * Clean up temporary files
 */
const cleanupTempFiles = (files) => {
  files?.forEach((file) => {
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error("Error deleting temp file:", e);
      }
    }
  });
};

/**
 * Upload file to R2 storage
 * Assumes you have uploadToR2 function from your R2 config
 */
const uploadFileToR2 = async (
  filePath,
  fileName,
  folder = "lease-agreements"
) => {
  try {
    const uploadToR2 = require("../utils/r2"); // Adjust path to your R2 utility
    const result = await uploadToR2(filePath, `${folder}/${fileName}`);
    return result.location; // Return the full URL
  } catch (error) {
    console.error(`Error uploading ${fileName} to R2:`, error);
    throw error;
  }
};

/**
 * Delete file from R2 storage
 */
const deleteFileFromR2 = async (fileUrl) => {
  try {
    if (!fileUrl) return;
    const deleteFromR2 = require("../utils/r2");
    const fileName = fileUrl.split("/").pop();
    await deleteFromR2(fileName);
  } catch (error) {
    console.error(`Error deleting ${fileUrl} from R2:`, error);
  }
};

// ====================== ROUTES ======================

/**
 * ✅ Upload lease agreement for a booking
 * POST /bookings/upload-lease
 * Used by HOST when opening booking details modal
 */
router.post(
  "/upload-lease",
  auth,
  uploadLease.single("leaseFile"),
  async (req, res) => {
    try {
      const { bookingId } = req.body;
      const userId = req.user.id;

      // ── Validate required fields ──
      if (!bookingId || !req.file) {
        cleanupTempFiles([req.file]);
        return res.status(400).json({
          error: "Missing required fields: bookingId and leaseFile",
        });
      }

      // ── Fetch booking ──
      const booking = await Booking.findById(bookingId).populate("property");
      if (!booking) {
        cleanupTempFiles([req.file]);
        return res.status(404).json({ error: "Booking not found" });
      }

      // ── Verify user is the host ──
      const property = await Property.findById(booking.property._id);
      if (!property || property.host.toString() !== userId) {
        cleanupTempFiles([req.file]);
        return res.status(403).json({
          error: "You are not authorized to upload a lease for this booking",
        });
      }

      // ── Delete old lease if exists ──
      if (booking.leaseUrl) {
        await deleteFileFromR2(booking.leaseUrl);
      }

      // ── Upload new lease to R2 ──
      let leaseUrl;
      try {
        const fileName = `${bookingId}-${req.file.filename}`;
        leaseUrl = await uploadFileToR2(req.file.path, fileName);
      } catch (uploadError) {
        console.error("Error uploading lease to R2:", uploadError);
        cleanupTempFiles([req.file]);
        return res.status(500).json({
          error: "Failed to upload lease agreement",
          details: uploadError.message,
        });
      }

      // ── Update booking with lease URL ──
      booking.leaseUrl = leaseUrl;
      const updatedBooking = await booking.save();

      // ── Cleanup temp file ──
      cleanupTempFiles([req.file]);

      res.status(200).json({
        success: true,
        message: "Lease agreement uploaded successfully",
        leaseUrl: updatedBooking.leaseUrl,
      });
    } catch (err) {
      console.error("Error uploading lease:", err);
      cleanupTempFiles([req.file]);
      res.status(500).json({
        error: "Server error",
        details: err.message,
      });
    }
  }
);

/**
 * ✅ Sign lease agreement
 * PUT /bookings/:id/sign-lease
 * Used by GUEST to confirm they've read and agreed to the lease
 */
router.put("/sign-lease/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // ── Fetch booking ──
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // ── Verify user is the guest ──
    if (booking.guest.toString() !== userId) {
      return res.status(403).json({
        error: "You are not authorized to sign this lease",
      });
    }

    // ── Check if lease exists ──
    if (!booking.leaseUrl) {
      return res.status(400).json({
        error: "No lease agreement has been uploaded for this booking",
      });
    }

    // ── Update booking with lease signature ──
    booking.leaseSignedAt = new Date();
    const updatedBooking = await booking.save();

    // ── Optional: Send email notification to host ──
    const property = await Property.findById(booking.property).populate("host");
    const guest = await User.findById(booking.guest);

    if (property && guest) {
      const hostUser = property.host;
      sendEmail({
        to: hostUser.email,
        subject: `Guest signed lease agreement for ${property.title}`,
        html: `
          <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
                <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
              </div>
              <div style="padding: 30px; color: #333;">
                <h2 style="color: #305CDE; text-align: center; margin-top: 0;">Lease Agreement Signed ✓</h2>
                <p>Hi <strong>${hostUser.firstName || "there"}</strong>,</p>
                <p><strong>${guest.firstName} ${
          guest.lastName
        }</strong> has signed the lease agreement for <strong>${
          property.title
        }</strong>.</p>
                <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Guest</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        guest.firstName
                      } ${guest.lastName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Property</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        property.title
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Signed on</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${new Date().toLocaleDateString()}</td>
                    </tr>
                  </table>
                </div>
                <p>The booking is now ready to proceed. You can message the guest or update the booking status from your dashboard.</p>
              </div>
              <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                This is an automated message, please do not reply.<br />
                © ${new Date().getFullYear()} VenCome. All rights reserved.
              </div>
            </div>
          </div>
        `,
      });
    }

    res.status(200).json({
      success: true,
      message: "Lease agreement signed successfully",
      leaseSignedAt: updatedBooking.leaseSignedAt,
    });
  } catch (err) {
    console.error("Error signing lease:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/**
 * ✅ Get lease agreement details for a booking
 * GET /bookings/:id/lease
 * Used to check lease status and URL
 */
router.get("/:id/lease", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.status(200).json({
      success: true,
      leaseUrl: booking.leaseUrl || null,
      leaseSignedAt: booking.leaseSignedAt || null,
      leaseStatus: booking.leaseSignedAt ? "signed" : "pending",
    });
  } catch (err) {
    console.error("Error fetching lease details:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

/**
 * ✅ Delete lease agreement
 * DELETE /bookings/:id/lease
 * Used by HOST to remove a lease (only if not yet signed by guest)
 */
router.delete("/:id/lease", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await Booking.findById(id).populate("property");
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // ── Verify user is the host ──
    const property = await Property.findById(booking.property._id);
    if (!property || property.host.toString() !== userId) {
      return res.status(403).json({
        error: "You are not authorized to delete this lease",
      });
    }

    // ── Prevent deletion if already signed ──
    if (booking.leaseSignedAt) {
      return res.status(400).json({
        error: "Cannot delete a lease that has already been signed",
      });
    }

    // ── Delete from R2 ──
    if (booking.leaseUrl) {
      await deleteFileFromR2(booking.leaseUrl);
    }

    // ── Update booking ──
    booking.leaseUrl = null;
    await booking.save();

    res.status(200).json({
      success: true,
      message: "Lease agreement deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting lease:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

module.exports = router;
