// models/Payment.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Number, required: true }, // total paid
    platformFee: { type: Number, required: true },
    hostAmount: { type: Number, required: true },

    provider: { type: String, enum: ["stripe", "paystack"], required: true },
    providerPaymentId: { type: String },

    status: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },

    escrowReleaseAt: { type: Date }, // booking end + 24h
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
