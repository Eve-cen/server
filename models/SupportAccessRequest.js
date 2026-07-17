const mongoose = require("mongoose");

// Consent-based "Account Access" flow: an admin requests access to a user's
// account, the user gets emailed a secure link to grant or deny it, and if
// granted the admin gets a time-boxed session (see routes/supportAccess.js
// and routes/admin.js POST /users/:id/impersonate).
const supportAccessRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, default: "" },
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "granted", "denied", "expired"],
      default: "pending",
    },
    requestedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
    // Set when granted — the admin's impersonation window (1h), separate
    // from the 24h window a pending request has to be answered at all.
    sessionExpiresAt: { type: Date },
    sessionEndedAt: { type: Date }, // set on manual "End session" or natural expiry
  },
  { timestamps: true }
);

supportAccessRequestSchema.index({ user: 1, createdAt: -1 });
supportAccessRequestSchema.index({ token: 1 }, { unique: true });

module.exports = mongoose.model("SupportAccessRequest", supportAccessRequestSchema);
