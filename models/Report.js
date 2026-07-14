const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["user", "property", "booking", "review"], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    enum: [
      "spam", "inappropriate", "fraud", "harassment", "fake_listing", "other",
      // Booking-dispute-specific reasons (type: "booking")
      "not_as_described", "no_show", "property_damage", "payment_issue",
    ],
    required: true,
  },
  description: { type: String, maxLength: 1000 },
  status: { type: String, enum: ["open", "under_review", "resolved", "dismissed"], default: "open" },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedAt: { type: Date },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);
