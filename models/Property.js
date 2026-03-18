const mongoose = require("mongoose");

// In your Property model file
const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      country: { type: String, required: true },
    },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    images: [{ type: String }],
    coverImage: { type: String },
    features: {
      wifi: { type: Boolean, default: false },
      restrooms: { type: Number, default: 0 },
      sizeSQM: { type: Number, default: 0 },
      seatCapacity: { type: Number, default: 0 },
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

    extras: [
      {
        name: String,
        price: Number,
      },
    ],
    pricing: {
      pricingType: {
        type: String,
        enum: ["DAILY", "HOURLY"],
        required: true,
        default: "DAILY",
      },

      // DAILY pricing
      weekdayPrice: {
        type: Number,
        min: 0,
        required: function () {
          return this.pricing.pricingType === "DAILY";
        },
      },

      // HOURLY pricing
      hourlyPrice: {
        type: Number,
        min: 0,
        required: function () {
          return this.pricing.pricingType === "HOURLY";
        },
      },

      minHours: {
        type: Number,
        default: 1,
      },

      preTaxPrice: Number,

      discounts: {
        newListing: { type: Boolean, default: false },
        lastMinute: { type: Boolean, default: false },
        weekly: { type: Boolean, default: false },
        monthly: { type: Boolean, default: false },
      },
    },

    bookingSettings: {
      approveFirstFive: { type: Boolean, default: true },
      instantBook: { type: Boolean, default: false },
      approveAllBookings: { type: Boolean, default: false },
    },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    rating: { type: Number, default: 0 },
    reviewNumber: { type: Number, default: 0 },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
    refundPolicy: {
      type: String,
      enum: ["flexible", "moderate", "strict", "non-refundable"],
      default: "moderate",
    },
    availability: {
      type: String,
      enum: ["all", "weekdays", "weekends", "custom"],
      default: "all",
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
      startTime: String, // "09:00"
      endTime: String, // "22:00"
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
        externalEventId: String, // for iCal sync
      },
    ],
    icalUrl: { type: String }, // External calendar link (Google, Outlook, etc.)
  },
  { timestamps: true }
);

propertySchema.pre("save", function (next) {
  if (this.pricing.useHourly && !this.pricing.hourlyPrice) {
    return next(
      new Error("Hourly price is required when hourly pricing is enabled")
    );
  }
  next();
});

module.exports = mongoose.model("Property", propertySchema);
