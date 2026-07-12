const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    whatsIncluded: { type: String, default: "" },
    // Optional host-authored terms for this specific listing (e.g. usage
    // restrictions, deposit rules). Separate from and in addition to
    // VenCome's platform-wide Terms & Conditions -- shown as a "Read More"
    // popup on the listing page, and the customer must agree to it after
    // clicking Request to Book/Book Now before the booking is created.
    listingTerms: { type: String, default: "" },
    location: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      country: { type: String, required: true },
    },
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    images: [{ type: String }],
    coverImage: { type: String },
    features: {
      wifi: { type: Boolean, default: false },
      restrooms: { type: Number, default: 0 },
      sizeSQM: { type: Number, default: 0 },
      seatCapacity: { type: Number, default: 0 },
      capacity: { type: Number, default: 0 },
      amenities: { type: [String], default: [] },
      houseRules: { type: String, default: "" },
      maxGuests: { type: Number, default: 0 },
      consultationArea: { type: Boolean, default: false },
      examinationCouch: { type: Boolean, default: false },
      sinkCounter: { type: Boolean, default: false },
      adjustableEnvironment: { type: Boolean, default: false },
      sharpsBin: { type: Boolean, default: false },
      naturalLight: { type: Boolean, default: false },
      dirtyTowelShoot: { type: Boolean, default: false },
      cqcCompliance: { type: Boolean, default: false },
      plug: { type: Boolean, default: false },
      sound: { type: Boolean, default: false },
      lockable: { type: Boolean, default: false },
      washbasin: { type: Boolean, default: false },
      clinicalSurface: { type: Boolean, default: false },
      wasteBin: { type: Boolean, default: false },
      meetCQCStandards: { type: Boolean, default: false },
      electricBed: { type: Boolean, default: false },
      adjustableStool: { type: Boolean, default: false },
      trolley: { type: Boolean, default: false },
      magnifyingLamp: { type: Boolean, default: false },
      storage: { type: Boolean, default: false },
      mirror: { type: Boolean, default: false },
      bathroom: { type: Number, default: 1 },
    },
    extras: [{ name: String, price: Number }],
    cqcDocuments: {
      type: [String],
      default: [],
    },
    pricing: {
      weekdayPrice: { type: Number, default: 0 },
      weekendPrice: { type: Number, default: 0 },
      hourlyPrice: { type: Number, default: 0 },
      pricingType: { type: String, default: "DAILY" },
      hourly: { type: Number, default: 0 },
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 },
      annual: { type: Number, default: 0 },
      discounts: {
        newListing: { type: Boolean, default: false },
        weekly: { type: Boolean, default: false },
        monthly: { type: Boolean, default: false },
      },
    },
    bookingSettings: {
      approveFirstFive: { type: Boolean, default: true },
      instantBook: { type: Boolean, default: false },
      approveAllBookings: { type: Boolean, default: false },
      refundPolicy: {
        type: String,
        enum: ["flexible", "moderate", "strict", "non-refundable"],
        default: "moderate",
      },
      // Buffer time (minutes) blocked before/after each booking so hosts get
      // clean-up/prep time. Surfaced in EditSpace.jsx and PropertyAvailability.jsx.
      bufferBefore: { type: Number, default: 0 },
      bufferAfter: { type: Number, default: 0 },
    },
    firstFiveApproved: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    subcategory: { type: String, default: "" },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    subcategories: [{ type: String }],
    rating: { type: Number, default: 0 },
    reviewNumber: { type: Number, default: 0 },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
    refundPolicy: {
      type: String,
      enum: ["flexible", "moderate", "strict", "non-refundable"],
      default: "moderate",
    },
    availability: {
      openDays: {
        type: [String],
        enum: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        default: [],
      },
      openTime: { type: String, default: "" },
      closeTime: { type: String, default: "" },
      minNotice: { type: String, default: "" },
      instantBook: { type: Boolean, default: false },
      maxAdvance: { type: String, default: "" },
      weekendAvailable: { type: Boolean, default: true },
      sameDayCutoff: { type: String, default: "" },
    },
    customAvailability: {
      days: [
        {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      ],
      startTime: String,
      endTime: String,
      minBookingHours: { type: Number, default: 2 },
    },
    blockedDates: [
      {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        reason: {
          type: String,
          enum: ["booked", "maintenance", "personal", "external"],
        },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
        externalEventId: String,
      },
    ],
    icalUrl: String,
    icalLastSyncedAt: Date,
    icalLastSyncError: String,
    leaseAgreement: {
      type: String,
      default: null,
    },
    // Optional host-written terms specific to this listing (e.g. equipment
    // handling, cancellation nuances, access rules). Separate from and in
    // addition to VenCome's platform-wide Terms & Conditions -- shown as a
    // "Read More" preview on the listing page, and gated behind a checkbox
    // at checkout (see Booking.listingTermsSnapshot for the agreement record).
    listingTerms: { type: String, default: "" },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
propertySchema.index({ host: 1 });
propertySchema.index({ category: 1 });
propertySchema.index({ isActive: 1 });
propertySchema.index({ "location.city": 1 });
propertySchema.index({ "location.country": 1 });
propertySchema.index({ "coordinates.latitude": 1, "coordinates.longitude": 1 });
propertySchema.index({ rating: -1 });
propertySchema.index({ createdAt: -1 });

module.exports = mongoose.model("Property", propertySchema);
