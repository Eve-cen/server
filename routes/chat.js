const router = require("express").Router();
const auth = require("../middleware/auth");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const containsBlockedContent = require("../utils/messageFilter");

/**
 * Get or create conversation
 */
router.post("/conversation/:bookingId", auth, async (req, res) => {
  const { bookingId } = req.params;

  let conversation = await Conversation.findOne({ booking: bookingId });

  if (!conversation) {
    conversation = await Conversation.create({
      booking: bookingId,
      guest: req.user.id,
      host: req.body.hostId,
    });
  }

  res.json(conversation);
});

/**
 * Get messages
 */
router.get("/:conversationId", auth, async (req, res) => {
  const messages = await Message.find({
    conversation: req.params.conversationId,
  }).populate("sender", "name");

  res.json(messages);
});

/**
 * Send message
 */
router.post("/:conversationId", auth, async (req, res) => {
  const io = req.app.get("io");
  const { text } = req.body;
  console.log(req.params);

  if (containsBlockedContent(text)) {
    return res.status(400).json({
      error: "Sharing contact details or social media is not allowed.",
    });
  }

  const message = await Message.create({
    conversation: req.params.conversationId,
    sender: req.user.id,
    text,
  });

  io.to(req.params.conversationId).emit("new_message", message);

  res.status(201).json(message);
});

router.post("/read/:conversationId", auth, async (req, res) => {
  await Message.updateMany(
    {
      conversation: req.params.conversationId,
      readBy: { $ne: req.user._id },
    },
    {
      $push: { readBy: req.user._id },
    }
  );

  const io = req.app.get("io");
  io.to(req.params.conversationId).emit("read_receipt", {
    userId: req.user._id,
  });

  res.json({ success: true });
});

module.exports = router;
