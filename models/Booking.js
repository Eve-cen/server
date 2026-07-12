const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests: { type: Number, default: 1 },
    totalPrice: { type: Number, required: true },
    totalNights: Number,
    totalHours: Number,
    // Duration type this specific booking was made under (a property can
    // have multiple pricing tiers enabled, so this isn't always the
    // property's default pricingType) and the matching unit count -- e.g.
    // pricingUnit: "week", totalUnits: 3 for a 3-week booking. This is the
    // single source of truth the UI uses to render an explicit breakdown
    // ("3 weeks × £200/week = £600") for every duration type, not just
    // daily/hourly (which totalNights/totalHours alone could already cover).
    pricingUnit: { type: String, enum: ["hour", "day", "week", "month", "year"] },
    totalUnits: Number,
    // Permanent record of the host's listing-specific terms this customer
    // agreed to at checkout (separate from VenCome's platform Terms &
    // Conditions). The exact text is snapshotted here rather than just
    // referencing the live Property.listingTerms field, since the host
    // could edit or clear their terms later and this must stay an accurate
    // record of what was actually agreed to, by whom, and when.
    listingTermsSnapshot: String,
    listingTermsAgreedAt: Date,
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
    // Set when Request to Book authorizes (but doesn't yet capture) the card.
    // Cleared implicitly once isPaid is true (captured) or the booking is
    // declined/expired (authorization released).
    paymentAuthorizedAt: Date,
    // Google Calendar event ID on the host's connected calendar, if any —
    // lets us update/delete the pushed event on cancellation.
    googleCalendarEventId: String,
    // Same, for Outlook / Microsoft Graph.
    outlookCalendarEventId: String,
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
    licensePdfUrl: {
      type: String,
      default: null,
    },
    leaseUrl: {
      type: String,
      default: null,
      description: "URL to the uploaded lease agreement file in R2 storage",
    },
    leaseUploadedAt: {
      type: Date,
      default: null,
      description: "Timestamp when lease was uploaded by host",
    },
    leaseSignedAt: {
      type: Date,
      default: null,
      description: "Timestamp when guest signed the lease",
    },
    stripeTransferId: String,
    disputeFrozen: { type: Boolean, default: false },
    disputeId: String,
    reviewed: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    review: { type: mongoose.Schema.Types.ObjectId, ref: "Review" },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
bookingSchema.index({ guest: 1, status: 1 });
bookingSchema.index({ host: 1, status: 1 });
bookingSchema.index({ property: 1, status: 1 });
bookingSchema.index({ isPaid: 1, escrowReleased: 1, status: 1 });
bookingSchema.index({ checkOut: 1 });

bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ leaseUrl: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
