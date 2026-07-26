const mongoose = require("mongoose");

// Singleton doc — one row holds platform-wide config for the admin Settings
// page (Platform/Security tabs). Use PlatformSettings.getSettings() rather
// than querying directly, so callers never have to handle the "doc doesn't
// exist yet" case themselves.
const platformSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: "singleton", unique: true },
    platformName: { type: String, default: "VenCome" },
    supportEmail: { type: String, default: "support@vencome.com" },
    currency: { type: String, default: "GBP" },
    maintenanceMode: { type: Boolean, default: false },
    registrationsEnabled: { type: Boolean, default: true },
    hostApplicationsEnabled: { type: Boolean, default: true },
    // Whether admin login requires an emailed OTP code after password, same
    // as every regular user's login already does. Defaults on since admin
    // accounts are the most sensitive tier on the platform.
    requireAdmin2FA: { type: Boolean, default: true },
    // How long an admin session (JWT) stays valid before requiring re-login.
    sessionTimeoutMinutes: { type: Number, default: 480 },
  },
  { timestamps: true }
);

platformSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ singleton: "singleton" });
  if (!settings) settings = await this.create({});
  return settings;
};

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
