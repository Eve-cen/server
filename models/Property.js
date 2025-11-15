const mongoose = require("mongoose");

const extraSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

const pricingSchema = new mongoose.Schema({
  weekdayPrice: { type: Number, required: true },
  preTaxPrice: { type: Number, required: true }, // Price before tax
  discounts: {
    newListing: { type: Boolean, default: false },
    lastMinute: { type: Boolean, default: false },
    weekly: { type: Boolean, default: false },
    monthly: { type: Boolean, default: false },
  },
});

const bookingSettingsSchema = new mongoose.Schema({
  approveFirstFive: { type: Boolean, default: false },
  instantBook: { type: Boolean, default: true },
});

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, required: true, min: 0, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

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
    },
    extras: [
      {
        name: String,
        price: Number,
      },
    ],
    pricing: {
      weekdayPrice: { type: Number, required: true },
      preTaxPrice: { type: Number },
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
    },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" }, // Make optional or required
    rating: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Property", propertySchema);
