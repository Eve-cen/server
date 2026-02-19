const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) return res.json({ received: true });

      const booking = await Booking.findById(bookingId).populate(
        "property",
        "host"
      );
      if (!booking || booking.isPaid) return res.json({ received: true });

      booking.isPaid = true;
      booking.stripeSessionId = session.id;
      booking.paymentIntentId = session.payment_intent;

      const releaseDate = new Date(booking.checkOut);
      releaseDate.setHours(releaseDate.getHours() + 24);

      const total = booking.totalPrice;
      const platformFee = Math.round(total * 0.1);
      const hostAmount = total - platformFee;

      booking.escrowReleaseDate = releaseDate;
      booking.platformFee = platformFee;
      booking.hostAmount = hostAmount;
      await booking.save();

      await Payment.create({
        booking: booking._id,
        guest: booking.guest,
        host: booking.property.host,
        amount: total,
        platformFee,
        hostAmount,
        provider: "stripe",
        providerPaymentId: session.payment_intent,
        status: "paid",
        escrowReleaseAt: releaseDate,
      });

      const io = req.app.get("io");
      io.to(`guest_${booking.guest}`).emit("paymentSuccess", { bookingId });

      const user = await User.findById(req.user.id);
      const displayName = user.displayName || user.firstName || "there";

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
    Payment Successful 🎉
  </h2>

  <p>Hi <strong>${displayName}</strong>,</p>

  <p>
    We’ve successfully received your payment. Your booking is now <strong>fully secured</strong>.
  </p>

  <!-- Payment Summary -->
  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #666;">Property</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.title || "—"}
        </td>
      </tr>
      <tr>
      <td style="padding: 6px 0; color: #666;">Amount paid</td>
      <td style="padding: 6px 0; text-align: right; font-weight: 600;">
      ${booking.totalPrice}
      </td>
      </tr>
      <tr> <td style="padding: 6px 0; color: #666;">Payment date</td> <td style="padding: 6px 0; text-align: right; font-weight: 600;"> ${new Date().toLocaleDateString()} </td> </tr>
    </table>
  </div>

  <p>
    The host has been notified of your payment and booking details.
  </p>

  <p>
    You can view or manage your booking anytime from your VenCome dashboard.
  </p>

  <p style="margin-bottom: 0;">
    Thank you for choosing VenCome — we wish you a fantastic stay!
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

      console.log(
        `Payment received for booking ${bookingId}. Escrow release at ${releaseDate}`
      );
    }

    res.json({ received: true });
  }
);

module.exports = router;
