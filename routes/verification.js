// server/routes/verification.js
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const auth = require("../middleware/auth");
const User = require("../models/User");
const router = express.Router();

// POST /api/verification/business - Submit business details
router.post("/business", auth, async (req, res) => {
  const { companyName, websiteURL, vat } = req.body;

  try {
    if (!companyName || !websiteURL || !vat) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.businessVerification = {
      companyName,
      websiteURL,
      vat,
      verifiedAt: new Date(),
    };
    user.businessVerified = true; // Set to true; in production, set to false pending admin review

    await user.save();
    res.json({ success: true, message: "Business verification submitted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/verification/business - Get user's business verification status
router.get("/business", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "businessVerified businessVerification"
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

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
