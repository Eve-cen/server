const express = require("express");
const User = require("../models/User");
const auth = require("../middleware/auth");
const router = express.Router();

// Update personal information (PUT /api/settings/personal)
router.put("/personal", auth, async (req, res) => {
  const { name, preferredName, email, phoneNumber, address, isVerified } =
    req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.name = name || user.name;
    user.preferredName = preferredName || user.preferredName;
    user.email = email || user.email;
    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.address = address || user.address;
    if (isVerified !== undefined) user.isVerified = isVerified; // Admin-only in production

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update privacy settings (PUT /api/settings/privacy)
router.put("/privacy", auth, async (req, res) => {
  const { readReceipts, showListings, showReviewInfo } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.privacySettings.readReceipts =
      readReceipts !== undefined
        ? readReceipts
        : user.privacySettings.readReceipts;
    user.privacySettings.showListings =
      showListings !== undefined
        ? showListings
        : user.privacySettings.showListings;
    user.privacySettings.showReviewInfo =
      showReviewInfo !== undefined
        ? showReviewInfo
        : user.privacySettings.showReviewInfo;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add payment method (POST /api/settings/payment)
router.post("/payment", auth, async (req, res) => {
  const { type, cardNumber, expiryDate, cvv } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.paymentMethods.push({ type, cardNumber, expiryDate, cvv });
    const updatedUser = await user.save();
    res.status(201).json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get payment methods (GET /api/settings/payment)
router.get("/payment", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.paymentMethods);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add payout method (POST /api/settings/payout)
router.post("/payout", auth, async (req, res) => {
  const { type, details } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.payoutMethods.push({ type, details });
    const updatedUser = await user.save();
    res.status(201).json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get payout methods (GET /api/settings/payout)
router.get("/payout", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.payoutMethods);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
