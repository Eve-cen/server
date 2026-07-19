const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const auth = require("../middleware/auth");
const router = express.Router();

// Update personal information (PUT /api/settings/personal)

router.put("/personal", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.displayName = req.body.firstName ?? user.firstName;
    user.firstName = req.body.firstName ?? user.firstName;
    user.lastName = req.body.lastName ?? user.lastName;
    user.email = req.body.email ?? user.email;
    user.phoneNumber = req.body.phoneNumber ?? user.phoneNumber;

    user.address = {
      floor: req.body.address?.floor,
      streetAddress: req.body.address?.streetAddress,
      city: req.body.address?.city,
      state: req.body.address?.state,
      postalCode: req.body.address?.postalCode,
      country: req.body.address?.country,
    };

    // Parse dob string into { day, month, year } before saving
    if (req.body.dob) {
      const date = new Date(req.body.dob);
      if (!isNaN(date)) {
        user.dob = {
          day: date.getUTCDate(),
          month: date.getUTCMonth() + 1, // months are 0-indexed
          year: date.getUTCFullYear(),
        };
      }
    } else {
      user.dob = user.dob; // keep existing
    }

    if (req.body.isVerified !== undefined) {
      user.isVerified = req.body.isVerified;
    }

    if (req.body.newsletterOptIn !== undefined) {
      user.newsletterOptIn = !!req.body.newsletterOptIn;
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
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

// Update notification preferences (PUT /api/settings/notifications)
// Currently only persists emailMarketing (newsletter opt-in) — the other
// toggles (emailBookings, emailMessages, smsBookings, smsReminders) don't
// have a backing preference on the User model yet.
router.put("/notifications", auth, async (req, res) => {
  const { notifications } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (notifications?.emailMarketing !== undefined) {
      user.newsletterOptIn = !!notifications.emailMarketing;
    }

    await user.save();
    res.json({ message: "Notification preferences saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Change password while logged in (PUT /api/settings/password)
router.put("/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: "All fields are required" });
  if (newPassword.length < 8)
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// // Add payment method (POST /api/settings/payment)
// router.post("/payment", auth, async (req, res) => {
//   const { type, cardNumber, expiryDate, cvv } = req.body;

//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ error: "User not found" });

//     user.paymentMethods.push({ type, cardNumber, expiryDate, cvv });
//     const updatedUser = await user.save();
//     res.status(201).json(updatedUser);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // Get payment methods (GET /api/settings/payment)
// router.get("/payment", auth, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ error: "User not found" });

//     res.json(user.paymentMethods);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

module.exports = router;
