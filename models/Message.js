const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, maxLength: 5000 },
  read: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },
  blockReason: String,
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model("Message", messageSchema);
