const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  guest: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  lastMessage: String,
  lastMessageAt: Date,
  enquiryDetails: {
    checkIn: Date,
    checkOut: Date,
    guests: Number,
    durationType: String,
    totalPrice: Number,
    message: String,
  },
}, { timestamps: true });

conversationSchema.index({ host: 1 });
conversationSchema.index({ guest: 1 });
conversationSchema.index({ property: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
