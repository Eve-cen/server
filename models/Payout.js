// server/models/Payout.js
const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema({
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    required: true,
  },
  amount: { type: Number, required: true }, // amount sent to host
  platformFee: { type: Number, required: true },
  totalReceived: { type: Number, required: true }, // guest paid amount
  stripeTransferId: { type: String }, // Stripe transfer/payout ID
  stripePayoutId: { type: String }, // Alternative payout ID
  payoutMethod: {
    type: String, // 'card', 'bank_account', 'paypal'
    required: true,
  },
  destination: { type: String }, // last 4 digits of bank/card
  destinationBrand: { type: String }, // Visa, Mastercard, etc.
  status: {
    type: String,
    enum: ["pending", "in_transit", "paid", "failed", "canceled"],
    default: "pending",
  },
  failureReason: { type: String }, // If failed
  releasedAt: { type: Date }, // When payout was initiated
  expectedArrival: { type: Date }, // When funds should arrive
  arrivedAt: { type: Date }, // When funds actually arrived
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update the updatedAt timestamp on save
payoutSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Payout", payoutSchema);
