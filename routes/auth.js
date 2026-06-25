const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const auth = require("../middleware/auth");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");
const { OAuth2Client } = require("google-auth-library");
const { client: redisClient } = require("../utils/redisClient");
const router = express.Router();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate 6-digit OTP (stored in Redis with TTL)
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const storeOTP = async (key, otp) => {
  await redisClient.setEx(`otp:${key}`, 600, otp); // 10 min TTL
};

const verifyOTP = async (key, otp) => {
  const stored = await redisClient.get(`otp:${key}`);
  if (!stored || stored !== otp) return false;
  await redisClient.del(`otp:${key}`);
  return true;
};

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -otp -otpExpires"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/signup ────────────────────────────────────────────────────────
router.post("/signup", authLimiter, async (req, res) => {
  const { email, password, isHost } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing)
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: false,
      isHost: !!isHost,
    });
    await user.save();

    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp);

    await sendEmail({
      to: normalizedEmail,
      subject: "Verify Your Email Address",
      html: emailTemplate(
        "Welcome! Verify Your Email",
        `Your verification code is:`,
        otp
      ),
    });

    res.json({
      message: "Account created. OTP sent to email.",
      requiresVerification: true,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error, please try again later" });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.authProvider === "google")
      return res
        .status(400)
        .json({ error: "This account uses Google sign-in" });

    if (password !== "otp-flow") {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
    }

    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp);

    await sendEmail({
      to: normalizedEmail,
      subject: "Login Verification Code",
      html: emailTemplate(
        "Login Verification",
        "Use the code below to complete your login:",
        otp
      ),
    });

    res.json({
      message: "OTP sent to email. Please verify to complete login.",
      requiresVerification: true,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error, please try again later" });
  }
});

// ─── POST /auth/verify-login ──────────────────────────────────────────────────
router.post("/verify-login", otpLimiter, async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ error: "Email and OTP are required" });

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const valid = await verifyOTP(normalizedEmail, otp);
    if (!valid)
      return res.status(400).json({ error: "Invalid or expired OTP" });

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ error: "User not found" });

    user.isVerified = true;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );

    // Store refresh token in Redis
    await redisClient.setEx(
      `refresh:${user._id}`,
      30 * 24 * 60 * 60,
      refreshToken
    );

    res.json({
      token,
      refreshToken,
      message: "Login successful",
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
    console.error("Verify login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/resend-otp ────────────────────────────────────────────────────
router.post("/resend-otp", otpLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ error: "User not found" });

    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp);

    await sendEmail({
      to: normalizedEmail,
      subject: "Your new verification code",
      html: emailTemplate("New Verification Code", "Your new code is:", otp),
    });

    res.json({ message: "OTP resent" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/refresh-token ─────────────────────────────────────────────────
router.post("/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(401).json({ error: "Refresh token required" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const stored = await redisClient.get(`refresh:${decoded.id}`);
    if (!stored || stored !== refreshToken)
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });

    const token = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", auth, async (req, res) => {
  try {
    await redisClient.del(`refresh:${req.user.id}`);
    res.json({ message: "Logged out successfully" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/google ────────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  const { token, isHost } = req.body;
  if (!token)
    return res.status(400).json({ error: "Google token is required" });

  try {
    const { email, firstName, lastName, picture, googleId } = req.body;
    const given_name = firstName;
    const family_name = lastName;

    if (!email || !googleId) {
      return res.status(400).json({ error: "Missing Google user data" });
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        firstName: given_name,
        lastName: family_name,
        profileImage: picture,
        googleId,
        authProvider: "google",
        password: await bcrypt.hash(googleId + process.env.JWT_SECRET, 12),
        isEmailVerified: true,
        isVerified: true,
        isHost: !!isHost,
      });
      await user.save();
    } else if (isHost && !user.isHost) {
      user.isHost = true;
      await user.save();
    }

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "30d" }
    );
    await redisClient.setEx(
      `refresh:${user._id}`,
      30 * 24 * 60 * 60,
      refreshToken
    );

    res.json({
      token: jwtToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isHost: user.isHost,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always respond 200 to prevent email enumeration
    if (!user)
      return res.json({
        message: "If that email exists, an OTP has been sent",
      });

    const otp = generateOTP();
    await storeOTP(`pwd:${email.toLowerCase().trim()}`, otp);

    res.json({ message: "If that email exists, an OTP has been sent" });

    sendEmail({
      to: email,
      subject: "Password Reset OTP",
      html: emailTemplate(
        "Password Reset Request",
        "Use the code below to reset your password:",
        otp
      ),
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
router.post("/verify-otp", otpLimiter, async (req, res) => {
  const { email, otp } = req.body;
  try {
    const valid = await verifyOTP(`pwd:${email.toLowerCase().trim()}`, otp);
    if (!valid)
      return res.status(400).json({ error: "Invalid or expired OTP" });
    // Issue a short-lived reset token
    const resetToken = jwt.sign(
      { email: email.toLowerCase().trim(), purpose: "reset" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    res.json({ message: "OTP verified", resetToken });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { resetToken, password, confirmPassword } = req.body;
  if (!resetToken || !password || !confirmPassword)
    return res.status(400).json({ error: "All fields are required" });
  if (password !== confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });
  if (password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });

  try {
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    if (decoded.purpose !== "reset")
      return res.status(400).json({ error: "Invalid reset token" });

    const user = await User.findOne({ email: decoded.email });
    if (!user) return res.status(400).json({ error: "User not found" });

    user.password = await bcrypt.hash(password, 12);
    await user.save();

    res.json({ message: "Password reset successful" });
    sendEmail({
      to: decoded.email,
      subject: "Password Reset Successful",
      html: emailTemplate(
        "Password Reset Successful",
        "Your password has been updated successfully.",
        null
      ),
    });
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(400).json({ error: "Reset link has expired" });
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /auth/account ─────────────────────────────────────────────────────
router.delete("/account", auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    await redisClient.del(`refresh:${req.user.id}`);
    res.json({ message: "Account deleted successfully" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/update-role ───────────────────────────────────────────────────
router.post("/update-role", auth, async (req, res) => {
  try {
    const { isHost } = req.body;
    await User.findByIdAndUpdate(req.user.id, { isHost: !!isHost });
    res.json({ message: "Role updated" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Email template helper ────────────────────────────────────────────────────
function emailTemplate(title, body, otp) {
  return `
<div style="font-family:'Manrope',Arial,sans-serif;background:#f4f4f7;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <div style="background:#f0f0f0;padding:20px;text-align:center;">
      <img src="${
        process.env.CLIENT_URL
      }/logo-blue.png" alt="VenCome" style="max-width:150px;height:auto;">
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

module.exports = router;
