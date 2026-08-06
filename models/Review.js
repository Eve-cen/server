const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
  },
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, trim: true },
  // "guest_to_host": the existing flow, guest reviewing the property/host.
  // "host_to_guest": the host reviewing the guest. `user` is always the
  // reviewer for both directions.
  type: {
    type: String,
    enum: ["guest_to_host", "host_to_guest"],
    default: "guest_to_host",
  },
  // Blind until the counterpart review (same booking, other direction) is
  // submitted, or 14 days pass — see utils/revealPastDueReviews.js.
  revealed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Review", reviewSchema);
