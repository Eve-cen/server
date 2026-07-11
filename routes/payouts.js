// server/routes/payout.js
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const auth = require("../middleware/auth");
const Payout = require("../models/Payout");
const makeUserHost = require("../utils/stripeConnect");

// ── Stripe Connect Express onboarding ───────────────────────────────────────
// This is the real payout-method connection flow: hosts never hand VenCome a
// raw bank account number — Stripe's own hosted onboarding collects it.

// Current connection status, for the Settings > Payouts tab.
router.get("/connect/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "stripeAccountId stripeOnboardingStatus"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.stripeAccountId) {
      return res.json({ status: "not_connected" });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    const status = account.details_submitted && account.payouts_enabled ? "connected" : "pending";

    if (status !== user.stripeOnboardingStatus) {
      await User.findByIdAndUpdate(req.user.id, { stripeOnboardingStatus: status });
    }

    res.json({ status });
  } catch (err) {
    console.error("Payout connect status error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Start (or resume) Stripe-hosted Connect onboarding. Creates the Express
// account on first call, then always returns a fresh onboarding link —
// Stripe account links expire quickly, so one isn't generated in advance.
router.post("/connect/onboarding-link", auth, async (req, res) => {
  try {
    const user = await makeUserHost(req.user.id);

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${process.env.CLIENT_URL}/settings?payout=refresh`,
      return_url: `${process.env.CLIENT_URL}/settings?payout=return`,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error("Payout onboarding link error:", err.message);
    res.status(500).json({ error: err.message || "Failed to start onboarding" });
  }
});

// Add payout method
// router.post("/", auth, async (req, res) => {
//   const { type, tokenId, last4, brand } = req.body;

//   if (!["card", "bank_account"].includes(type)) {
//     return res.status(400).json({ error: "Invalid payout type" });
//   }

//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ error: "User not found" });

//     // Verify token is valid
//     const token = await stripe.tokens.retrieve(tokenId);
//     if (!token || token.used) {
//       return res.status(400).json({ error: "Invalid or expired token" });
//     }

//     // Create Stripe customer if doesn't exist
//     if (!user.stripeCustomerId) {
//       const customer = await stripe.customers.create({
//         email: user.email,
//         name: `${user.firstName} ${user.lastName}`,
//         source: tokenId,
//       });
//       user.stripeCustomerId = customer.id;
//     } else {
//       // Add card to existing customer
//       await stripe.customers.createSource(user.stripeCustomerId, {
//         source: tokenId,
//       });
//     }

//     // Set first card as default
//     const isDefault = user.payoutMethods.length === 0;

//     // If this should be default, unset others
//     if (isDefault) {
//       user.payoutMethods.forEach((method) => {
//         method.isDefault = false;
//       });
//     }

//     // Add payout method
//     user.payoutMethods.push({
//       type,
//       brand: brand.toLowerCase(),
//       cardNumber: `************${last4}`,
//       last4: last4,
//       stripeCardId: type === "card" ? tokenId : undefined,
//       isDefault: user.payoutMethods.length === 0,
//     });

//     await user.save();

//     // Return sanitized data
//     res.status(201).json({
//       success: true,
//       payoutMethods: user.payoutMethods.map((method) => ({
//         _id: method._id,
//         type: method.type,
//         brand: method.brand,
//         last4: method.last4,
//         isDefault: method.isDefault,
//         createdAt: method.createdAt,
//       })),
//     });
//   } catch (err) {
//     console.error("Add payout method error:", err);
//     res.status(500).json({ error: err.message || "Server error" });
//   }
// });

router.post("/", auth, async (req, res) => {
  const { type, tokenId, clientIp, last4, brand, bankAccount, currency } =
    req.body;

  if (!["card", "bank_account"].includes(type)) {
    return res.status(400).json({ error: "Invalid payout type" });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const isDefault = user.payoutMethods.length === 0;

  // unset existing default
  if (isDefault) {
    user.payoutMethods.forEach((m) => (m.isDefault = false));
  }

  if (type === "card") {
    user.payoutMethods.push({
      type: "card",
      brand: brand?.toLowerCase(),
      last4,
      clientIp,
      cardNumber: `************${last4}`,
      stripeCardId: tokenId,
      isDefault,
    });
  }

  if (type === "bank_account") {
    const payoutMethod = {
      type: "bank_account",
      provider: "stripe",
      country: user.address.country,
      currency,
      clientIp,
      stripeTokenId: tokenId || null,
      isDefault,
    };

    // Only store display metadata when NOT using a token
    if (!tokenId) {
      payoutMethod.bankAccount = {
        bankName: bankAccount.bankName || null,
        last4: bankAccount.last4 || null,
        ibanLast4: bankAccount.ibanLast4 || null,
      };
    }

    user.payoutMethods.push(payoutMethod);
  }

  // if (type === "bank_account") {
  //   user.payoutMethods.push({
  //     type: "bank_account",
  //     bankAccount: {
  //       bankName: bankAccount.bankName,
  //       accountNumber: bankAccount.accountNumber,
  //       routingNumber: bankAccount.routingNumber,
  //       country: bankAccount.country,
  //       currency: bankAccount.currency,
  //       last4: bankAccount.accountNumber.slice(-4),
  //     },
  //     isDefault,
  //   });
  // }

  await user.save();

  res.status(201).json({
    success: true,
    payoutMethods: user.payoutMethods,
  });
});

// Get payout methods
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("payoutMethods");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      payoutMethods: user.payoutMethods.map((method) => ({
        _id: method._id,
        type: method.type,
        brand: method.brand,
        last4: method.last4,
        isDefault: method.isDefault,
        createdAt: method.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add to server/routes/payouts.js

// Get payout history for host
router.get("/payout-history", auth, async (req, res) => {
  try {
    const payouts = await Payout.find({ host: req.user.id })
      .populate({
        path: "booking",
        populate: {
          path: "property",
          select: "title images",
        },
      })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      payouts: payouts.map((payout) => ({
        _id: payout._id,
        amount: payout.amount,
        platformFee: payout.platformFee,
        totalReceived: payout.totalReceived,
        status: payout.status,
        payoutMethod: payout.payoutMethod,
        destination: payout.destination,
        destinationBrand: payout.destinationBrand,
        booking: payout.booking,
        releasedAt: payout.releasedAt,
        expectedArrival: payout.expectedArrival,
        arrivedAt: payout.arrivedAt,
        createdAt: payout.createdAt,
      })),
    });
  } catch (err) {
    console.error("Get payout history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete payout method
router.delete("/:methodId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const methodIndex = user.payoutMethods.findIndex(
      (m) => m._id.toString() === req.params.methodId
    );

    if (methodIndex === -1) {
      return res.status(404).json({ error: "Payout method not found" });
    }

    user.payoutMethods.splice(methodIndex, 1);
    await user.save();

    res.json({ success: true, message: "Payout method deleted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Set default payout method
router.patch("/:methodId/default", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Unset all defaults
    user.payoutMethods.forEach((method) => {
      method.isDefault = method._id.toString() === req.params.methodId;
    });

    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
