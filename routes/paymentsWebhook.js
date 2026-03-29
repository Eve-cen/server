const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const PLATFORM_FEE = Number(process.env.PLATFORM_FEE_PERCENT || 15) / 100;

router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) return res.json({ received: true });

      const booking = await Booking.findById(bookingId).populate("property", "title host");
      if (!booking || booking.isPaid) return res.json({ received: true });

      booking.isPaid = true;
      booking.stripeSessionId = session.id;
      booking.paymentIntentId = session.payment_intent;

      const releaseDate = new Date(booking.checkOut);
      releaseDate.setHours(releaseDate.getHours() + 24);

      const total = booking.totalPrice;
      const platformFee = Math.round(total * PLATFORM_FEE * 100) / 100;
      const hostAmount = Math.round((total - platformFee) * 100) / 100;

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
      io?.to(`user_${booking.guest}`).emit("paymentSuccess", { bookingId });

      const user = await User.findById(booking.guest);
      if (user) {
        const displayName = user.displayName || user.firstName || "there";
        sendEmail({
          to: user.email,
          subject: "Your payment is confirmed 🎉",
          html: `<div style="font-family:'Manrope',Arial,sans-serif;background:#f4f4f7;padding:20px;">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
              <div style="background:#f0f0f0;padding:20px;text-align:center;"><img src="${process.env.CLIENT_URL}/logo-blue.png" alt="VenCome" style="max-width:150px;"></div>
              <div style="padding:30px;color:#333;">
                <h2 style="color:#305CDE;text-align:center;">Payment Successful 🎉</h2>
                <p>Hi <strong>${displayName}</strong>, your payment of <strong>$${total}</strong> for <strong>${booking.property.title}</strong> has been received.</p>
                <p>Your booking is now fully secured. View or manage it from your VenCome dashboard.</p>
              </div>
              <div style="background:#f0f0f0;padding:20px;text-align:center;font-size:12px;color:#888;">© ${new Date().getFullYear()} VenCome. All rights reserved.</div>
            </div>
          </div>`,
        });
      }
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object;
      console.warn("[Dispute] New dispute created:", dispute.id, "charge:", dispute.charge);
      // TODO: notify admin and freeze the associated booking's escrow
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

module.exports = router;
