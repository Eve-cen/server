const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const auth = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const uploadToR2 = require("../utils/uploadService");
const User = require("../models/User");
const multer = require("multer");
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename — never use original name directly
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only image files are allowed"), false);
    cb(null, true);
  },
});

// POST /api/verification/business
router.post("/business", auth, upload.single("idDocument"), async (req, res) => {
  const { companyName, websiteURL, vat } = req.body;
  const tempPath = req.file?.path;

  try {
    if (!companyName || !websiteURL || !vat)
      return res.status(400).json({ error: "All fields are required" });
    if (!req.file)
      return res.status(400).json({ error: "ID document is required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = await uploadToR2(tempPath, req.file.filename, req.file.mimetype);

    user.businessVerification = {
      companyName,
      websiteURL,
      vat,
      idDocument: result.location,
      submittedAt: new Date(),
      status: "under_review",
    };
    user.businessVerified = false;
    await user.save();

    res.json({ success: true, status: "under_review", message: "Business verification submitted and under review" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    // Always clean up temp file
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
});

// GET /api/verification/business
router.get("/business", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("businessVerification businessVerified");
    let status = "not_submitted";
    if (user.businessVerification?.status) status = user.businessVerification.status;
    else if (user.businessVerified) status = "verified";
    res.json({ status, businessVerification: user.businessVerification || null });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/verification/create-verification-session
router.post("/create-verification-session", auth, async (req, res) => {
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { userId: req.user.id },
      options: { document: { require_live_capture: true, require_matching_selfie: true } },
      return_url: `${process.env.CLIENT_URL}/profile/about/verification-complete`,
    });

    // Do NOT mark verified here — only mark via webhook after Stripe confirms
    await User.findByIdAndUpdate(req.user.id, { stripeVerificationSessionId: session.id });

    res.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start verification" });
  }
});

// POST /api/verification/webhook
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "identity.verification_session.verified") {
    const session = event.data.object;
    await User.findByIdAndUpdate(session.metadata.userId, {
      isIdentityVerified: true,
      verifiedAt: new Date(),
      stripeVerificationSessionId: session.id,
    });
    req.app.get("io")?.emit("userVerified", { userId: session.metadata.userId });
  }

  if (event.type === "identity.verification_session.requires_input") {
    const session = event.data.object;
    await User.findByIdAndUpdate(session.metadata.userId, { isIdentityVerified: false });
  }

  res.json({ received: true });
});

module.exports = router;
