const mongoose = require("mongoose");

const broadcastTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BroadcastTemplate", broadcastTemplateSchema);
