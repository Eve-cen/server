const Booking = require("../models/Booking");

async function markCompletedBookings() {
  const now = new Date();

  const result = await Booking.updateMany(
    {
      status: "confirmed",
      checkOut: { $lt: now },
      completed: false,
    },
    {
      // status must reach "completed" for utils/releaseEscrow.js's hourly
      // cron to ever find this booking -- it independently enforces its own
      // 24h-post-checkout buffer, so this job only needs to react to
      // checkout having passed, not wait an extra 24h itself.
      $set: { completed: true, status: "completed" },
    }
  );

  console.log(`Marked ${result.modifiedCount} bookings as completed`);
}

module.exports = markCompletedBookings; // ✅ Default export
