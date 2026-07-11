const mongoose = require("mongoose");

// Replaces the old single-draft-per-user schema, which was built for an
// earlier version of the create-space form (clinical-specific fields like
// cqcCompliance, examinationCouch, etc.) and was never actually wired up to
// CreateSpace.jsx — the wizard only ever used localStorage. This version
// stores the wizard's form state as a raw blob instead of mapping every
// field onto rigid schema paths, so it doesn't need to be kept in sync with
// CreateSpace.jsx's form shape, and supports multiple drafts per host.
const draftSchema = new mongoose.Schema(
  {
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "Untitled space" },
    step: { type: Number, default: 1 },
    coverImage: { type: String, default: "" },
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Draft", draftSchema);
