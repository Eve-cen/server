const cron = require("node-cron");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const sendEmail = require("./sendEmail");

// Request to Book gives the host 24 hours to approve/decline (see
// routes/bookings.js and the booking-confirmation email). If they never
// respond, auto-decline the request and release any held card authorization
// so the guest is never charged.
module.exports = function setupBookingExpiry() {
  cron.schedule("*/30 * * * *", async () => {
    console.log("[Booking Expiry] Checking for unanswered requests older than 24h...");
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const staleBookings = await Booking.find({
        status: "pending",
        createdAt: { $lt: cutoff },
        // Only touch bookings created under the new deferred-capture flow
        // (paymentAuthorizedAt is set by the webhook only when a manual-
        // capture PaymentIntent was authorized). This deliberately excludes
        // any pre-existing "pending" booking from before this feature
        // shipped — those may already be paid under the old immediate-
        // capture flow, and auto-declining them here would both cancel a
        // booking the host might still be about to approve and send the
        // guest a "you were not charged" email that could be false.
        paymentAuthorizedAt: { $exists: true },
      })
        .populate("property", "title")
        .populate("guest", "email firstName displayName");

      for (const booking of staleBookings) {
        try {
          const awaitingCapture = Boolean(booking.paymentIntentId) && !booking.isPaid;

          if (awaitingCapture) {
            await stripe.paymentIntents.cancel(booking.paymentIntentId).catch((err) => {
              console.warn(
                `[Booking Expiry] Could not release payment hold for booking ${booking._id}:`,
                err.message
              );
            });
            await Payment.findOneAndUpdate({ booking: booking._id }, { status: "released" });
          }

          booking.status = "declined";
          await booking.save();

          const guestUser = booking.guest;
          if (guestUser?.email) {
            const guestName = guestUser.displayName || guestUser.firstName || "there";
            await sendEmail({
              to: guestUser.email,
              subject: "Your booking request expired",
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0A1628;">Booking Request Expired</h2>
                  <p>Hi ${guestName},</p>
                  <p>The host didn't respond to your booking request for <strong>${booking.property?.title || "the space"}</strong> within 24 hours, so it has expired.</p>
                  <p>You have not been charged — no payment was captured.</p>
                  <a href="https://www.vencome.com/search" style="display:inline-block;padding:14px 28px;background:#0A1628;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Find Another Space</a>
                  <p style="margin-top:24px;color:#6B7280;font-size:13px;">The VenCome Team</p>
                </div>
              `,
            });
          }

          console.log(`[Booking Expiry] Expired booking ${booking._id}`);
        } catch (err) {
          console.error(`[Booking Expiry] Failed to expire booking ${booking._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[Booking Expiry Cron] Error:", err.message);
    }
  });
};
