const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "booking_request",
        "booking_confirmed",
        "booking_declined",
        "booking_cancelled",
        "payment_received",
        "new_message",
        "new_review",
        "payout_sent",
        "verification_update",
        "admin_message",
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false },
    link: { type: String }, // frontend route to navigate to
    meta: { type: mongoose.Schema.Types.Mixed }, // extra data (bookingId, propertyId etc.)
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
