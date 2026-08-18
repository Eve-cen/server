const mongoose = require("mongoose");

const ticketMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderRole: { type: String, enum: ["customer", "admin"], required: true },
  body: { type: String, required: true, maxlength: 5000 },
  attachments: [String],
  createdAt: { type: Date, default: Date.now },
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category: {
    type: String,
    enum: ["booking_payments", "hosting_listings", "account_security", "trust_safety", "technical", "other"],
    required: true,
  },
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  relatedProperty: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  subject: { type: String, required: true, maxlength: 150 },
  status: {
    type: String,
    enum: ["open", "in_progress", "waiting_on_user", "resolved", "closed"],
    default: "open",
  },
  priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
  assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  messages: [ticketMessageSchema],
  lastMessageAt: { type: Date },
  lastMessageBy: { type: String, enum: ["customer", "admin"] },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

supportTicketSchema.index({ ticketNumber: 1 }, { unique: true });
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, priority: -1, lastMessageAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
