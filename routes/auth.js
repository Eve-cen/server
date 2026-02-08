const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const auth = require("../middleware/auth");
const { OAuth2Client } = require("google-auth-library");
const router = express.Router();
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate OTP
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Login/Signup - Step 1: Send OTP
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (user) {
      // Existing user - verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
    } else {
      // New user - create account
      const hashedPassword = await bcrypt.hash(password, 10);
      user = new User({
        email: normalizedEmail,
        password: hashedPassword,
        isVerified: false,
      });
      await user.save();
      isNewUser = true;
    }

    // Generate and save OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    console.log("Login/Signup OTP:", otp);

    // Send OTP email
    await sendEmail({
      to: normalizedEmail,
      subject: isNewUser
        ? "Verify Your Email Address"
        : "Login Verification Code",
      html: `
        <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header / Logo -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
      <img src="https://vencome.netlify.app/logo-blue.png" alt="Vencome" style="max-width: 150px; height: auto;">
    </div>

    <!-- Body -->
    <div style="padding: 30px; color: #333;">
      <h2 style="color: #305CDE; margin-top: 0; text-align: center;">
        ${isNewUser ? "Welcome! Verify Your Email" : "Login Verification"}
      </h2>
      <p>Hi,</p>
      <p>
        ${
          isNewUser
            ? "Thank you for signing up! Please verify your email address using the OTP below:"
            : "We received a login request for your account. Use the OTP below to continue:"
        }
      </p>

      <!-- OTP Code -->
      <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 25px 0; border-radius: 8px;">
        <span style="font-size: 28px; font-weight: bold; color: #305CDE; letter-spacing: 6px;">
          ${otp}
        </span>
      </div>

      <p>This OTP will expire in <strong>10 minutes</strong>.</p>
      <p>If you didn't ${
        isNewUser ? "create an account" : "request to login"
      }, please ignore this email.</p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      This is an automated message, please do not reply. <br />
      © ${new Date().getFullYear()} Vencome. All rights reserved.
    </div>
  </div>
</div>
      `,
    });

    res.json({
      message: "OTP sent to email. Please verify to complete login.",
      requiresVerification: true,
      isNewUser,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error, please try again later" });
  }
});

router.post("/google", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Google token is required" });
  }

  try {
    // 1️⃣ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const {
      email,
      given_name,
      family_name,
      picture,
      email_verified,
      sub: googleId,
    } = payload;

    if (!email_verified) {
      return res.status(401).json({ error: "Google email not verified" });
    }

    // 2️⃣ Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        email,
        firstName: given_name,
        lastName: family_name,
        profileImage: picture,
        googleId,
        authProvider: "google",
        password: await bcrypt.hash(googleId, 10), // fallback, never used directly
        isEmailVerified: true,
      });

      await user.save();
    }

    // 3️⃣ Generate JWT
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Login/Signup - Step 2: Verify OTP and Complete Login
router.post("/verify-login", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    console.log(user);

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      token,
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Verify login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot Password - Step 1: Send OTP
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const otp = generateOTP();
    user.otp = otp;
    console.log("Password Reset OTP:", otp);
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    await sendEmail({
      to: email,
      subject: "Password Reset OTP",
      html: `
        <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header / Logo -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
      <img src="https://vencome.netlify.app/logo-blue.png" alt="Vencome" style="max-width: 150px; height: auto;">
    </div>

    <!-- Body -->
    <div style="padding: 30px; color: #333;">
      <h2 style="color: #305CDE; margin-top: 0; text-align: center;">Password Reset Request</h2>
      <p>Hi,</p>
      <p>We received a request to reset your password. Use the OTP below to continue:</p>

      <!-- OTP Code -->
      <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 25px 0; border-radius: 8px;">
        <span style="font-size: 28px; font-weight: bold; color: #305CDE; letter-spacing: 6px;">
          ${otp}
        </span>
      </div>

      <p>This OTP will expire in <strong>10 minutes</strong>.</p>
      <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      This is an automated message, please do not reply. <br />
      © ${new Date().getFullYear()} Vencome. All rights reserved.
    </div>
  </div>
</div>
      `,
    });

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot Password - Step 2: Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    res.json({ message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot Password - Step 3: Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (!email || !otp || !password || !confirmPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    // Verify OTP again before password reset
    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Send confirmation email
    await sendEmail({
      to: email,
      subject: "Password Reset Successful",
      html: `
       <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header / Logo -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
      <img src="https://vencome.netlify.app/logo-blue.png" alt="Vencome" style="max-width: 150px; height: auto;">
    </div>

    <!-- Body -->
    <div style="padding: 30px; color: #333;">
      <h2 style="color: #305CDE; margin-top: 0; text-align: center;">Password Reset Successful</h2>
      <p>Hi,</p>
      <p>Your password has been successfully reset.</p>
      <p>You can now log in with your new password.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      This is an automated message, please do not reply. <br />
      © ${new Date().getFullYear()} Vencome. All rights reserved.
    </div>
  </div>
  </div>
      `,
    });

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
