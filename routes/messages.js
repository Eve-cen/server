const express = require("express");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const auth = require("../middleware/auth");
const router = express.Router();

// GET: Get conversation with host for a property
router.get("/property/:propertyId", auth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const guest = req.user.id;

    let conversation = await Conversation.findOne({
      property: propertyId,
      guest,
    }).populate("host", "name profileImage");

    if (!conversation) {
      const property = await require("../models/Property").findById(propertyId);
      if (!property)
        return res.status(404).json({ error: "Property not found" });

      conversation = new Conversation({
        property: propertyId,
        host: property.host,
        guest,
      });
      await conversation.save();
      await conversation.populate("host", "name profileImage");
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate("sender", "name profileImage");

    res.json({ conversation, messages });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST: Send message
router.post("/", auth, async (req, res) => {
  const { conversationId, text } = req.body;
  try {
    const message = new Message({
      conversation: conversationId,
      sender: req.user.id,
      text,
    });
    await message.save();
    await message.populate("sender", "name profileImage");

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: text,
      lastMessageAt: new Date(),
    });

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
