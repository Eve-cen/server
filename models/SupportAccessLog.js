const mongoose = require("mongoose");

// Audit trail for the consent-based Account Access / Technical Support flow
// (see models/SupportAccessRequest.js). Records every step — requested,
// granted, denied, expired, accessed, ended — so there's a full paper trail
// of who asked for access, on which account, and what happened.
const supportAccessLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who requested/accessed
    request: { type: mongoose.Schema.Types.ObjectId, ref: "SupportAccessRequest" },
    reason: { type: String },
    action: {
      type: String,
      enum: ["requested", "granted", "denied", "expired", "accessed", "ended"],
      required: true,
    },
  },
  { timestamps: true }
);

supportAccessLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SupportAccessLog", supportAccessLogSchema);
