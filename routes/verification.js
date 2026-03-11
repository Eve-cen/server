// server/routes/verification.js
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const auth = require("../middleware/auth");
const fs = require("fs");
const uploadToR2 = require("../utils/uploadService");
const User = require("../models/User");
const multer = require("multer");
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  }, // 5MB limit per file
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
});

// Helper function to upload multiple files to R2
const uploadFilesToR2 = async (files) => {
  const uploadPromises = files.map(async (file) => {
    try {
      const result = await uploadToR2(file.path, file.filename);
      return result.location; // Returns the R2 URL
    } catch (error) {
      console.error(`Error uploading ${file.filename}:`, error);
      // Clean up local file if it still exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw error;
    }
  });

  return await Promise.all(uploadPromises);
};

// Helper function to delete files from R2
const deleteFilesFromR2 = async (imageUrls) => {
  const deletePromises = imageUrls.map(async (url) => {
    try {
      // Extract filename from URL
      const filename = url.split("/").pop();
      await deleteFromR2(filename);
    } catch (error) {
      console.error(`Error deleting ${url}:`, error);
    }
  });

  await Promise.all(deletePromises);
};

// POST /api/verification/business - Submit business details
router.post(
  "/business",
  upload.single("idDocument"),
  auth,
  async (req, res) => {
    const { companyName, websiteURL, vat } = req.body;

    try {
      if (!companyName || !websiteURL || !vat) {
        return res.status(400).json({ error: "All fields are required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "ID document is required" });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Upload ID to R2
      const [idUrl] = await uploadFilesToR2([req.file]);

      user.businessVerification = {
        companyName,
        websiteURL,
        vat,
        idDocument: idUrl,
        submittedAt: new Date(),
        status: "under_review",
      };

      user.businessVerified = false;

      await user.save();

      res.json({
        success: true,
        status: "under_review",
        message: "Business verification submitted and under review",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// GET /api/verification/business - Get user's business verification status
router.get("/business", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "businessVerification businessVerified"
    );

    let status = "not_submitted";

    if (user.businessVerification?.status) {
      status = user.businessVerification.status;
    } else if (user.businessVerified) {
      status = "verified";
    }

    res.json({
      status,
      businessVerification: user.businessVerification || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create Identity Verification Session
router.post("/create-verification-session", auth, async (req, res) => {
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { userId: req.user.id },

      provided_details: {
        email: req.user.email,
      },

      options: {
        document: {
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },

      // ❗️Stripe Identity supports ONLY return_url
      return_url: `${process.env.CLIENT_URL}/profile/about/verification-complete`,
    });

    // Save session ID to user (optional)
    await require("../models/User").findByIdAndUpdate(req.user.id, {
      stripeVerificationSessionId: session.id,
      isIdentityVerified: true,
    });

    res.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start verification" });
  }
});

// Webhook: Listen for verification status
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "identity.verification_session.verified") {
      const session = event.data.object;
      const userId = session.metadata.userId;

      await require("../models/User").findByIdAndUpdate(userId, {
        isVerified: true,
        verifiedAt: new Date(),
        stripeVerificationSessionId: session.id,
      });

      req.app.get("io")?.emit("userVerified", { userId });
    }

    res.json({ received: true });
  }
);

module.exports = router;
