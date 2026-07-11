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
  },
  { timestamps: true }
);

marketSchema.index({ order: 1 });

module.exports = mongoose.model("Market", marketSchema);
