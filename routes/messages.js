const express = require("express");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// GET: Get all conversations for current user
router.get("/conversations", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await Conversation.find({
      $or: [{ host: userId }, { guest: userId }],
    })
      .populate("host", "firstName lastName displayName profileImage name email")
      .populate("guest", "firstName lastName displayName profileImage name email")
      .populate("property", "title coverImage")
      .sort({ lastMessageAt: -1 });

    res.json(conversations);
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: unread message count for the logged-in user across all conversations
router.get("/unread-count", auth, async (req, res) => {
  try {
    const Message = require("../models/Message");
    const Conversation = require("../models/Conversation");

    const conversations = await Conversation.find({
      $or: [{ host: req.user.id }, { guest: req.user.id }],
    }).select("_id");

    const conversationIds = conversations.map((c) => c._id);

    const unreadCount = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: req.user.id },
      read: false,
    });

    res.json({ success: true, unreadCount });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Get or create conversation for a property
router.get("/property/:propertyId", auth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const guestId = req.user.id;

    let conversation = await Conversation.findOne({
      property: propertyId,
      guest: guestId,
    })
      .populate("host", "firstName lastName displayName profileImage name email")
      .populate("guest", "firstName lastName displayName profileImage name email")
      .populate("property", "title coverImage");

    if (!conversation) {
      const property = await Property.findById(propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

      conversation = new Conversation({
        property: propertyId,
        host: property.host,
        guest: guestId,
        participants: [property.host, guestId],
      });
      await conversation.save();
      await conversation.populate([
        { path: "host", select: "firstName lastName displayName profileImage name email" },
        { path: "guest", select: "firstName lastName displayName profileImage name email" },
        { path: "property", select: "title coverImage" },
      ]);
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate("sender", "firstName lastName displayName profileImage");

    res.json({ conversation, messages });
  } catch (err) {
    console.error("Get property conversation error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST: Create enquiry conversation with booking details
router.post("/enquiry", auth, async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut, guests, durationType, totalPrice, message } = req.body;
    const guestId = req.user.id;

    const property = await Property.findById(propertyId).populate("host", "firstName lastName displayName profileImage name email");
    if (!property) return res.status(404).json({ error: "Property not found" });

    // Find existing conversation or create new one
    let conversation = await Conversation.findOne({
      property: propertyId,
      guest: guestId,
    });

    if (!conversation) {
      conversation = new Conversation({
        property: propertyId,
        host: property.host._id,
        guest: guestId,
        participants: [property.host._id, guestId],
        enquiryDetails: { checkIn, checkOut, guests, durationType, totalPrice, message },
        lastMessageAt: new Date(),
      });
      await conversation.save();
    }

    // Create the enquiry message
    const enquiryText = `📅 Booking Enquiry\n\nDates: ${new Date(checkIn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(checkOut).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}\nDuration: ${durationType}\nGuests: ${guests}\nTotal: £${totalPrice}${message ? `\n\nMessage: ${message}` : ""}`;

    const msg = new Message({
      conversation: conversation._id,
      sender: guestId,
      text: enquiryText,
    });
    await msg.save();
    await msg.populate("sender", "firstName lastName displayName profileImage");

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: enquiryText.slice(0, 100),
      lastMessageAt: new Date(),
    });

    res.json({ conversation, message: msg });
  } catch (err) {
    console.error("Create enquiry error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: Get messages for a conversation
router.get("/:conversationId", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId)
      .populate("host", "firstName lastName displayName profileImage name email")
      .populate("guest", "firstName lastName displayName profileImage name email")
      .populate("property", "title coverImage location");

    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    if (
      conversation.host._id.toString() !== userId &&
      conversation.guest._id.toString() !== userId
    ) {
      return res.status(403).json({ error: "Not authorised" });
    }

    const messages = await Message.find({ conversation: conversationId })
      .sort({ createdAt: 1 })
      .populate("sender", "firstName lastName displayName profileImage");

    // Mark messages as read
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, read: false },
      { read: true }
    );

    res.json({ conversation, messages });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST: Send message in a conversation
router.post("/", auth, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    if (
      conversation.host.toString() !== userId &&
      conversation.guest.toString() !== userId
    ) {
      return res.status(403).json({ error: "Not authorised" });
    }

    const message = new Message({
      conversation: conversationId,
      sender: userId,
      text,
    });
    await message.save();
    await message.populate("sender", "firstName lastName displayName profileImage");

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: text.slice(0, 100),
      lastMessageAt: new Date(),
    });

    // Emit via socket
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("message", message);
      const recipientId = conversation.host.toString() === userId
        ? conversation.guest.toString()
        : conversation.host.toString();
      io.to(`user_${recipientId}`).emit("newMessage", {
        conversationId,
        message,
      });
    }

    res.json(message);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
