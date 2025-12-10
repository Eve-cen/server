const express = require("express");
require("dotenv").config({ path: "config.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const auth = require("../middleware/auth");
const router = express.Router();

// POST: Create Checkout Session
router.post("/create-checkout-session", auth, async (req, res) => {
  const { bookingId } = req.body;

  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      guest: req.user.id,
    }).populate("property", "title coverImage");

    if (!booking || booking.isPaid) {
      return res.status(400).json({ error: "Invalid or already paid booking" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: booking.property.title,
              images: booking.property.coverImage
                ? [booking.property.coverImage]
                : undefined,
            },
            unit_amount: Math.round(booking.totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // success_url: `${process.env.CLIENT_URL_DEV}/my-bookings?success=true`,
      // cancel_url: `${process.env.CLIENT_URL_DEV}/my-bookings?cancel=true`,
      success_url: `${process.env.CLIENT_URL}/my-bookings?success=true`,
      cancel_url: `${process.env.CLIENT_URL}/my-bookings?cancel=true`,
      metadata: { bookingId: booking._id.toString() },
    });

    // Save session ID
    booking.stripeSessionId = session.id;
    booking.isPaid = true;
    await booking.save();

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE ERROR:", err); // ← See the real problem
    res.status(500).json({ error: err.message });
  }
});

// Webhook: Handle payment success
router.post(
  "/webhook",
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
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata.bookingId;

      await Booking.findByIdAndUpdate(bookingId, {
        isPaid: true,
        stripeSessionId: session.id,
        paymentIntentId: session.payment_intent,
      });

      // Notify via Socket.IO
      const io = req.app.get("io");
      io.to(`guest_${session.client_reference_id}`).emit("paymentSuccess", {
        bookingId,
      });
    }

    res.json({ received: true });
  }
);

module.exports = router;
