// const mongoose = require("mongoose");

// const paymentMethodSchema = new mongoose.Schema({
//   type: { type: String, enum: ["credit_card", "debit_card"], required: true },
//   cardNumber: { type: String, required: true }, // Store encrypted in production
//   expiryDate: { type: String, required: true }, // e.g., "12/25"
//   cvv: { type: String, required: true }, // Store encrypted in production
// });

// const payoutMethodSchema = new mongoose.Schema({
//   type: {
//     type: String,
//     enum: ["paypal", "payoneer", "bank_transfer", "card"],
//     required: true,
//   },
//   details: { type: String, required: true }, // e.g., email for PayPal, account number for bank
// });

// const privacySettingsSchema = new mongoose.Schema({
//   readReceipts: { type: Boolean, default: false },
//   showListings: { type: Boolean, default: true },
//   showReviewInfo: { type: Boolean, default: true }, // Includes city/country, trip type, etc.
// });

// const userSchema = new mongoose.Schema(
//   {
//     email: { type: String, required: true, unique: true },
//     password: { type: String, required: true },
//     name: { type: String, required: true }, // Legal name
//     preferredName: { type: String },
//     phoneNumber: { type: String },
//     address: { type: String },
//     isVerified: { type: Boolean, default: false },
//     paymentMethods: [paymentMethodSchema],
//     payoutMethods: [payoutMethodSchema],
//     privacySettings: privacySettingsSchema,
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ["credit_card", "debit_card"], required: true },
  cardNumber: { type: String, required: true },
  expiryDate: { type: String, required: true },
  cvv: { type: String, required: true },
});

const payoutMethodSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["paypal", "payoneer", "bank_transfer", "card"],
    required: true,
  },
  details: { type: String, required: true },
});

const privacySettingsSchema = new mongoose.Schema({
  readReceipts: { type: Boolean, default: false },
  showListings: { type: Boolean, default: true },
  showReviewInfo: { type: Boolean, default: true },
});

const reviewSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
  },
  rating: { type: Number, required: true, min: 0, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: false },
    preferredName: { type: String },
    phoneNumber: { type: String },
    address: { type: String },
    isVerified: { type: Boolean, default: false },
    profileImage: {
      type: String,
      default:
        "https://thumbs.dreamstime.com/b/portrait-young-handsome-man-white-shirt-outdoor-portrait-young-handsome-man-white-shirt-outdoor-nice-appearance-131934608.jpg",
    },
    displayName: { type: String },
    bio: { type: String },
    paymentMethods: [paymentMethodSchema],
    payoutMethods: [payoutMethodSchema],
    privacySettings: privacySettingsSchema,
    reviews: [reviewSchema], // User's reviews
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
