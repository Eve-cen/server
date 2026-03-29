const express = require("express");
const Report = require("../models/Report");
const auth = require("../middleware/auth");
const { generalLimiter } = require("../middleware/rateLimiter");
const router = express.Router();

// POST /api/reports
router.post("/", auth, generalLimiter, async (req, res) => {
  const { type, targetId, reason, description } = req.body;
  if (!type || !targetId || !reason)
    return res.status(400).json({ error: "type, targetId and reason are required" });

  try {
    // Prevent duplicate reports
    const existing = await Report.findOne({ reporter: req.user.id, type, targetId });
    if (existing) return res.status(409).json({ error: "You have already reported this" });

    const report = await Report.create({ reporter: req.user.id, type, targetId, reason, description });
    res.status(201).json({ message: "Report submitted. Our team will review it shortly.", report });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/reports/my — user's own submitted reports
router.get("/my", auth, async (req, res) => {
  try {
    const reports = await Report.find({ reporter: req.user.id }).sort({ createdAt: -1 });
    res.json(reports);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
