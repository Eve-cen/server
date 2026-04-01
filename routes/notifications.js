const express = require("express");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const router = express.Router();

// GET /api/notifications — paginated
const mongoose = require("mongoose");

router.get("/", auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const notificationsData = await Notification.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user.id) } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          paginatedResults: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
          unreadCount: [{ $match: { read: false } }, { $count: "count" }],
        },
      },
    ]);

    const { paginatedResults, totalCount, unreadCount } = notificationsData[0];

    res.json({
      notifications: paginatedResults,
      total: totalCount[0]?.count || 0,
      unreadCount: unreadCount[0]?.count || 0,
      page,
      pages: Math.ceil((totalCount[0]?.count || 0) / limit),
    });
  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification)
      return res.status(404).json({ error: "Notification not found" });
    res.json(notification);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/notifications/mark-all-read
router.post("/mark-all-read", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/notifications/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    res.json({ message: "Notification deleted" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
