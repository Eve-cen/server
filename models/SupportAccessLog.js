const mongoose = require("mongoose");

// Audit trail for the consent-based support access feature (see
// User.supportAccess). Records every grant, revoke, and actual admin use so
// there's a full paper trail of who accessed a user's account, when, and
// under what consent.
const supportAccessLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // set only for "accessed"
    action: { type: String, enum: ["granted", "revoked", "expired", "accessed"], required: true },
  },
  { timestamps: true }
);

supportAccessLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SupportAccessLog", supportAccessLogSchema);
