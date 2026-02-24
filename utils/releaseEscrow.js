const cron = require("node-cron");
const Booking = require("../models/Booking");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

module.exports = function setupEscrowRelease() {
  // Runs every hour (you can change to '0 0 * * *' for daily at midnight)
  cron.schedule("* * * * *", async () => {
    console.log("[Escrow Release] Checking for bookings ready for payout...");

    try {
      const now = new Date();

      const readyBookings = await Booking.find({
        // status: "completed",
        // isPaid: true,
        // escrowReleased: false,
        // checkOut: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // 24 hours ago
      }).populate("host");

      console.log(readyBookings);

      for (const booking of readyBookings) {
        const host = await User.findById(booking.host);

        if (!host.stripeAccountId) {
          console.warn(`Host ${host._id} has no connected Stripe account`);
          continue;
        }

        const platformFee = Math.round(
          booking.totalPrice * (process.env.PLATFORM_FEE_PERCENT / 100)
        );
        const amountToHost = Math.round(booking.hostAmount * 100);

        console.log(booking);

        // try {
        //   const transfer = await stripe.transfers.create({
        //     amount: amountToHost,
        //     currency: "usd",
        //     destination: host.stripeAccountId,
        //     transfer_group: booking._id.toString(),
        //     description: `Payout for booking ${booking._id} after 24hr escrow`,
        //   });

        //   console.log(transfer);

        //   booking.escrowReleased = true;
        //   await booking.save();

        //   console.log(
        //     `Escrow released for booking ${booking._id}: $${
        //       amountToHost / 100
        //     } to host ${host._id}`
        //   );
        // } catch (transferErr) {
        //   console.error(
        //     `Failed to release escrow for ${booking._id}:`,
        //     transferErr
        //   );
        // }
      }
    } catch (err) {
      console.error("[Escrow Release Cron] Error:", err);
    }
  });
};
