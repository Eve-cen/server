const mongoose = require("mongoose");

const marketSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    flag: { type: String, default: "🌍" }, // emoji flag
    cities: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["active", "coming_soon", "planned"],
      default: "planned",
    },
    phase: { type: String, default: "" }, // e.g. "Phase 1"
    order: { type: Number, default: 0 },
    currency: { type: String, default: "GBP" },
    primaryLanguage: { type: String, default: "English" },
    // Commission override — when active, bookings in this market (matched by
    // property.location.country/city against name/cities, same matching used
    // by the admin dashboard's booking count) use this flat rate instead of
    // the platform default. See PlatformSettings.defaultCommissionRate and
    // routes/bookings.js's commissionRate calculation.
    commissionRate: { type: Number, default: null, min: 0, max: 100 },
    commissionOverrideActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

marketSchema.index({ order: 1 });

module.exports = mongoose.model("Market", marketSchema);
