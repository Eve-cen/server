const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const auth = require("../middleware/auth");
const sendEmail = require("../utils/sendEmail");
const { generateOTP, storeOTP, verifyOTP } = require("../utils/otp");
const { client: redisClient } = require("../utils/redisClient");
const router = express.Router();

// Update personal information (PUT /api/settings/personal)

router.put("/personal", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.displayName = req.body.firstName ?? user.firstName;
    user.firstName = req.body.firstName ?? user.firstName;
    user.lastName = req.body.lastName ?? user.lastName;
    // Email is intentionally NOT settable here -- it can only be changed via
    // the verified /email/request-change + /email/verify-change flow below,
    // which requires the current password and confirms the new address.
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

// Request an email change (POST /api/settings/email/request-change).
// Requires the current password, then sends a verification code to the NEW
// address (not the old one) so a typo or a hijacked session can't silently
// redirect where future OTP-login codes get sent.
router.post("/email/request-change", auth, async (req, res) => {
  const { newEmail, currentPassword } = req.body;
  if (!newEmail || !currentPassword)
    return res.status(400).json({ error: "New email and current password are required" });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ error: "Current password is incorrect" });

    const normalizedEmail = newEmail.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return res.status(400).json({ error: "Please enter a valid email address" });
    if (normalizedEmail === user.email)
      return res.status(400).json({ error: "That's already your current email" });

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing)
      return res.status(409).json({ error: "That email is already in use" });

    const otp = generateOTP();
    await storeOTP(`emailchange:${user._id}`, otp);
    await redisClient.setEx(`pending-email:${user._id}`, 600, normalizedEmail);

    await sendEmail({
      to: normalizedEmail,
      subject: "Confirm Your New Email Address",
      html: settingsEmailTemplate(
        "Confirm Your New Email",
        "Enter this code in VenCome to confirm this is your new email address:",
        otp
      ),
    });

    // Security notice to the OLD address in case this wasn't the account owner.
    sendEmail({
      to: user.email,
      subject: "Email Change Requested on Your VenCome Account",
      html: settingsEmailTemplate(
        "Email Change Requested",
        `A request was made to change your account email to ${normalizedEmail}. If this wasn't you, contact support immediately and change your password.`,
        null
      ),
    });

    res.json({ message: "Verification code sent to the new email address", requiresVerification: true });
  } catch (err) {
    console.error("Email change request error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Confirm the email change with the code sent to the new address
// (POST /api/settings/email/verify-change).
router.post("/email/verify-change", auth, async (req, res) => {
  const { otp } = req.body;
  if (!otp) return res.status(400).json({ error: "Verification code is required" });

  try {
    const pendingEmail = await redisClient.get(`pending-email:${req.user.id}`);
    if (!pendingEmail)
      return res.status(400).json({ error: "No pending email change found. Please request again." });

    const valid = await verifyOTP(`emailchange:${req.user.id}`, otp);
    if (!valid) return res.status(400).json({ error: "Invalid or expired code" });

    // Re-check for a duplicate in case another account claimed this email
    // while this verification was pending.
    const existing = await User.findOne({ email: pendingEmail, _id: { $ne: req.user.id } });
    if (existing) {
      await redisClient.del(`pending-email:${req.user.id}`);
      return res.status(409).json({ error: "That email is already in use" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.email = pendingEmail;
    await user.save();
    await redisClient.del(`pending-email:${req.user.id}`);

    sendEmail({
      to: pendingEmail,
      subject: "Your Email Has Been Updated",
      html: settingsEmailTemplate(
        "Email Updated",
        "Your VenCome account email has been successfully updated to this address.",
        null
      ),
    });

    res.json({
      message: "Email updated successfully",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        isHost: user.isHost,
      },
    });
  } catch (err) {
    console.error("Email change verify error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

function settingsEmailTemplate(title, body, otp) {
  return `
<div style="font-family:'Manrope',Arial,sans-serif;background:#f4f4f7;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <div style="background:#f0f0f0;padding:20px;text-align:center;">
      <img src="${process.env.CLIENT_URL}/logo-blue.png" alt="VenCome" style="max-width:150px;height:auto;">
    </div>
    <div style="padding:30px;color:#333;">
      <h2 style="color:#305CDE;margin-top:0;text-align:center;">${title}</h2>
      <p>${body}</p>
      ${
        otp
          ? `<div style="background:#f4f4f4;padding:20px;text-align:center;margin:25px 0;border-radius:8px;"><span style="font-size:28px;font-weight:bold;color:#305CDE;letter-spacing:6px;">${otp}</span></div><p>This code expires in <strong>10 minutes</strong>.</p>`
          : ""
      }
    </div>
    <div style="background:#f0f0f0;padding:20px;text-align:center;font-size:12px;color:#888;">
      This is an automated message, please do not reply.<br/>© ${new Date().getFullYear()} VenCome. All rights reserved.
    </div>
  </div>
</div>`;
}

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
