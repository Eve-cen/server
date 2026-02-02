const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

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

      console.log(
        `Payment received for booking ${bookingId}. Escrow release at ${releaseDate}`
      );
    }

    res.json({ received: true });
  }
);

module.exports = router;
