const mongoose = require("mongoose");

const draftSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    listingType: String,
    title: String,
    description: String,
    location: {
      address: String,
      city: String,
      country: String,
    },
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    features: {
      wifi: { type: Boolean, default: true },
      restrooms: { type: Number, default: 1 },
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
    },
    extras: [
      {
        name: String,
        price: Number,
      },
    ],
    // Store image URLs from server uploads
    images: [
      {
        url: String,
        filename: String,
      },
    ],
    coverImage: String,
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    pricing: {
      pricingType: { type: String, default: "DAILY" },
      weekdayPrice: { type: Number, default: 0 },
      hourlyPrice: { type: Number, default: 0 },
      preTaxPrice: { type: Number, default: 0 },
      discounts: {
        newListing: { type: Boolean, default: true },
        lastMinute: { type: Boolean, default: false },
        weekly: { type: Boolean, default: false },
        monthly: { type: Boolean, default: false },
      },
    },
    bookingSettings: {
      approveFirstFive: { type: Boolean, default: false },
      instantBook: { type: Boolean, default: true },
    },
    currentStep: { type: Number, default: 1 },
    lastSaved: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Ensure one draft per user
draftSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model("Draft", draftSchema);
