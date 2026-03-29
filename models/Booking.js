const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  guests: { type: Number, default: 1 },
  totalPrice: { type: Number, required: true },
  totalNights: Number,
  totalHours: Number,
  status: {
    type: String,
    enum: ["pending", "confirmed", "declined", "cancelled", "completed"],
    default: "pending",
  },
  extras: [{ name: String, price: Number }],
  discountApplied: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false },
  stripeSessionId: String,
  paymentIntentId: String,
  cancelledBy: { type: String, enum: ["guest", "host"] },
  cancelledAt: Date,
  refund: {
    percent: Number,
    amount: Number,
    reason: String,
    stripeRefundId: String,
    processedAt: Date,
  },
  escrowReleaseDate: Date,
  escrowReleased: { type: Boolean, default: false },
  platformFee: { type: Number, default: 0 },
  hostAmount: { type: Number, default: 0 },
  stripeTransferId: String,
  reviewed: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  review: { type: mongoose.Schema.Types.ObjectId, ref: "Review" },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────────
bookingSchema.index({ guest: 1, status: 1 });
bookingSchema.index({ host: 1, status: 1 });
bookingSchema.index({ property: 1, status: 1 });
bookingSchema.index({ isPaid: 1, escrowReleased: 1, status: 1 });
bookingSchema.index({ checkOut: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
