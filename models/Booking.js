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
    approveAllBookings: { type: Boolean, default: false },
  },
  extras: [{ name: String, price: Number }],
  discountApplied: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false },
  stripeSessionId: { type: String },
  paymentIntentId: { type: String },
  cancelledBy: { type: String, enum: ["guest", "host"] },
  cancelledAt: { type: Date },
  refund: {
    percent: Number,
    amount: Number,
    reason: String,
    stripeRefundId: String,
    processedAt: Date,
  },
  escrowReleaseDate: { type: Date }, // when funds should be released
  escrowReleased: { type: Boolean, default: false },
  platformFee: { type: Number, default: 0 },
  hostAmount: { type: Number, default: 0 },
  stripeTransferId: { type: String },
  reviewed: { type: Boolean, default: false },
  completed: {
    type: Boolean,
    default: false,
  },
  review: { type: mongoose.Schema.Types.ObjectId, ref: "Review" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Booking", bookingSchema);
