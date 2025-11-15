const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
  },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  guests: { type: Number, default: 1 },
  totalPrice: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "declined", "cancelled"],
    default: "pending",
  },
  bookingSettings: {
    approveFirstFive: { type: Boolean, default: true },
    instantBook: { type: Boolean, default: false },
  },
  extras: [{ name: String, price: Number }],
  discountApplied: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false },
  stripeSessionId: { type: String },
  paymentIntentId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Booking", bookingSchema);
