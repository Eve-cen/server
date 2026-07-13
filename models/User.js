const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema({
  accountNumber: { type: String, required: true },
  routingNumber: { type: String },
  bankName: { type: String },
  country: { type: String, required: true },
  currency: { type: String, required: true },
});

const privacySettingsSchema = new mongoose.Schema({
  readReceipts: { type: Boolean, default: false },
  showListings: { type: Boolean, default: true },
  showReviewInfo: { type: Boolean, default: true },
});

const reviewSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
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
  type: { type: String, enum: ["card", "bank_account", "paypal"], required: true },
  brand: String,
  cardNumber: String,
  last4: String,
  stripeCardId: String,
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const payoutMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ["card", "bank_account", "paypal"], required: true },
  brand: String,
  last4: String,
  bankAccount: bankAccountSchema,
  stripeCardId: String,
  isDefault: { type: Boolean, default: false },
  clientIp: String,
  createdAt: { type: Date, default: Date.now },
});

const payoutHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  currency: { type: String, default: "usd" },
  stripeTransferId: String,
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const addressSchema = new mongoose.Schema({
  streetAddress: String,
  floor: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
});

const businessVerificationSchema = new mongoose.Schema({
  companyName: String,
  websiteURL: String,
  vat: String,
  idDocument: String,
  submittedAt: Date,
  resolvedAt: Date,
  notes: String,
  status: {
    type: String,
    enum: ["under_review", "verified", "rejected", "not_submitted"],
    default: "under_review",
  },
});

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    firstName: String,
    lastName: String,
    phoneNumber: String,
    address: addressSchema,
    isVerified: { type: Boolean, default: false },
    isIdentityVerified: { type: Boolean, default: false },
    venComeVerified: { type: Boolean, default: false },
    venComeVerifiedAt: { type: Date, default: null },
    venComeVerifiedAppliedAt: { type: Date, default: null },
    isHost: { type: Boolean, default: false },
    newsletterOptIn: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    adminTitle: { type: String, default: "" }, // e.g. "Founder", "Tech Lead" — display only
    isBanned: { type: Boolean, default: false },
    profileImage: {
      type: String,
      default: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y&s=200",
    },
    displayName: String,
    bio: String,
    paymentMethods: [paymentMethodSchema],
    payoutMethods: [payoutMethodSchema],
    savedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: "Property" }],
    payoutHistory: [payoutHistorySchema],
    privacySettings: { type: privacySettingsSchema, default: () => ({}) },
    businessVerified: { type: Boolean, default: false },
    businessVerification: businessVerificationSchema,
    dob: dobSchema,
    reviews: [reviewSchema],
    stripeAccountId: String,
    // Connect Express account state, driven by routes/payouts.js — not the
    // guest-side card/customer flow below.
    stripeOnboardingStatus: {
      type: String,
      enum: ["not_connected", "pending", "connected"],
      default: "not_connected",
    },
    stripeCustomerId: String,
    stripeVerificationSessionId: String,
    ip: String,
    googleId: String,
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    avatar: String,
    isEmailVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    mcc: String,
    website: String,
    businessType: String,
    // Host-level Google Calendar connection (separate from googleId/authProvider
    // above, which is only used for login). Two-way sync: VenCome bookings push
    // out as events, and events on this calendar block VenCome availability.
    googleCalendar: {
      connected: { type: Boolean, default: false },
      refreshToken: String,
      email: String,
      connectedAt: Date,
      lastSyncedAt: Date,
      lastSyncError: String,
    },
    // Same shape and same two-way sync pattern as googleCalendar above, via
    // Microsoft Graph instead of the Google Calendar API.
    outlookCalendar: {
      connected: { type: Boolean, default: false },
      refreshToken: String,
      email: String,
      connectedAt: Date,
      lastSyncedAt: Date,
      lastSyncError: String,
    },
    // Cal.com connects via a personal API key the host pastes in (Cal.com's
    // own dashboard -> Settings -> Developer -> API Keys), not OAuth.
    calcom: {
      connected: { type: Boolean, default: false },
      apiKey: String,
      username: String,
      connectedAt: Date,
      lastSyncedAt: Date,
      lastSyncError: String,
    },
    // Calendly — standard OAuth2, same shape as googleCalendar/outlookCalendar.
    calendly: {
      connected: { type: Boolean, default: false },
      refreshToken: String,
      email: String,
      connectedAt: Date,
      lastSyncedAt: Date,
      lastSyncError: String,
    },
    // Apple iCloud Calendar via CalDAV -- connects with an Apple ID email +
    // an app-specific password (Apple has no practical OAuth flow for this).
    apple: {
      connected: { type: Boolean, default: false },
      username: String, // Apple ID email
      password: String, // app-specific password
      connectedAt: Date,
      lastSyncedAt: Date,
      lastSyncError: String,
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
userSchema.index({ isHost: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ "businessVerification.status": 1 });
userSchema.index({ googleId: 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
