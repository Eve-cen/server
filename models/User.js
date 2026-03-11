const mongoose = require("mongoose");

// const cardDetailsSchema = new mongoose.Schema({
//   cardNumber: { type: String, required: true },
//   expiryDate: { type: String, required: true },
//   cvv: { type: String, required: true },
// });

const bankAccountSchema = new mongoose.Schema({
  accountNumber: { type: String, required: true },
  routingNumber: { type: String },
  bankName: { type: String },
  country: { type: String, required: true },
  currency: { type: String, required: true },
});

// const paymentMethodSchema = new mongoose.Schema({
//   type: {
//     type: String,
//     enum: ["credit_card", "debit_card", "bank_transfer", "paypal"],
//     required: true,
//   },
//   details: { type: mongoose.Schema.Types.Mixed, required: true }, // allows card or bank object
// });

// const payoutMethodSchema = new mongoose.Schema({
//   type: {
//     type: String,
//     enum: ["paypal", "payoneer", "bank_transfer", "card"],
//     required: true,
//   },
//   details: {
//     type: Object,
//     required: true,
//   }, // allows card or bank object
// });

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

const dobSchema = new mongoose.Schema({
  day: { type: Number, required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
});

const paymentMethodSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["card", "bank_account", "paypal"],
    required: true,
  }, // 'card', 'bank_account', etc.
  brand: String, // visa, mastercard, amex, discover, etc.
  cardNumber: String, // Masked number: ************1234
  last4: String, // Last 4 digits
  stripeCardId: String, // Stripe card ID for future charges
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Schema for individual payout methods (cards, bank accounts)
// const payoutMethodSchema = new mongoose.Schema({
//   type: {
//     type: String,
//     enum: ["card", "bank_account", "paypal"],
//     required: true,
//   },
//   brand: String, // Visa, Mastercard, Verve, etc. Only for cards
//   last4: String, // Last 4 digits, for cards or bank
//   cardNumber: String, // masked card number (optional)
//   stripeCardId: String, // Stripe token/card ID
//   bankAccount: {
//     bankName: String,
//     accountNumber: String,
//     routingNumber: String,
//     country: String,
//     currency: String,
//     last4: String,
//   },
//   isDefault: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now },
// });

const payoutMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["card", "bank_account", "paypal"],
      required: true,
    },

    provider: {
      type: String,
      enum: ["stripe", "paypal", "manual"],
      default: "stripe",
    },

    country: {
      type: String,
      required: true,
    },

    currency: {
      type: String,
      required: true,
    },

    clientIp: {
      type: String,
      required: true,
    },

    /* =====================
       STRIPE IDENTIFIERS
       ===================== */
    stripeTokenId: {
      type: String, // tok_*, btok_*
    },

    stripePaymentMethodId: {
      type: String, // pm_*
    },

    stripeCardId: {
      type: String, // card_*
    },

    /* =====================
       CARD METADATA
       ===================== */
    card: {
      brand: String, // Visa, Mastercard, Verve
      last4: String,
      expMonth: Number,
      expYear: Number,
    },

    /* =====================
       BANK METADATA (SAFE)
       ===================== */
    bankAccount: {
      bankName: String,
      last4: String, // US bank
      ibanLast4: String, // SEPA
    },

    /* =====================
       PAYPAL
       ===================== */
    paypal: {
      email: String,
      payerId: String,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Schema for actual payouts to host (history)
const payoutHistorySchema = new mongoose.Schema({
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
  amount: { type: Number, required: true }, // sent to host
  platformFee: { type: Number, required: true },
  totalReceived: { type: Number, required: true }, // guest paid
  stripeTransferId: String,
  stripePayoutId: String,
  payoutMethod: { type: String, required: true }, // 'card', 'bank_account', 'paypal'
  destination: String, // last 4 digits
  destinationBrand: String, // Visa, Mastercard, etc.
  status: {
    type: String,
    enum: ["pending", "in_transit", "paid", "failed", "canceled"],
    default: "pending",
  },
  failureReason: String,
  releasedAt: Date,
  expectedArrival: Date,
  arrivedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

payoutHistorySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const addressSchema = new mongoose.Schema({
  floor: { type: String },
  streetAddress: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String },
});

const businessVerificationSchema = new mongoose.Schema({
  companyName: { type: String },
  websiteURL: { type: String },
  vat: { type: String },
  verifiedAt: { type: Date },
  status: {
    type: String,
    enum: ["under_review", "verified", "not_submitted"],
    default: "under_review",
  },
});

// Main User schema
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    firstName: String,
    lastName: String,
    phoneNumber: String,
    address: addressSchema,
    isVerified: { type: Boolean, default: false },
    isIdentityVerified: { type: Boolean, default: false },
    otp: String,
    otpExpires: Date,
    profileImage: {
      type: String,
      default:
        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y&s=200",
    },
    displayName: String,
    bio: String,
    // bankAccount: bankAccountSchema,
    paymentMethods: [paymentMethodSchema], // your guest payment methods
    payoutMethods: [payoutMethodSchema], // host cards/banks for payouts
    payoutHistory: [payoutHistorySchema], // actual payouts sent to host
    privacySettings: privacySettingsSchema,
    businessVerified: { type: Boolean, default: false },
    businessVerification: businessVerificationSchema,
    dob: dobSchema,
    reviews: [reviewSchema],
    isHost: { type: Boolean, default: false },
    stripeAccountId: String, // Stripe Connect account
    ip: String,
    googleId: { type: String },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    avatar: String,
    isEmailVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
