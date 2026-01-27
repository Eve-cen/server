const Booking = require("../models/Booking");

async function markCompletedBookings() {
  const now = new Date();

  const result = await Booking.updateMany(
    {
      status: "confirmed",
      checkOut: { $gt: now },
      completed: false,
    },
    {
      $set: { completed: true },
    }
  );

  console.log(`Marked ${result.modifiedCount} bookings as completed`);
}

module.exports = markCompletedBookings; // ✅ Default export
