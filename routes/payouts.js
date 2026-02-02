// server/routes/payout.js
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const auth = require("../middleware/auth");
const Payout = require("../models/Payout");

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
  const { type, tokenId, last4, brand, bankAccount } = req.body;

  if (!["card", "bank_account"].includes(type)) {
    return res.status(400).json({ error: "Invalid payout type" });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isDefault = user.payoutMethods.length === 0;

    // unset previous defaults if first payout method
    if (isDefault) {
      user.payoutMethods.forEach((m) => (m.isDefault = false));
    }

    /* =======================
       CARD PAYOUT
    ======================= */
    if (type === "card") {
      if (!tokenId || !last4 || !brand) {
        return res.status(400).json({ error: "Missing card data" });
      }

      const token = await stripe.tokens.retrieve(tokenId);
      if (!token || token.used) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          source: tokenId,
        });
        user.stripeCustomerId = customer.id;
      } else {
        await stripe.customers.createSource(user.stripeCustomerId, {
          source: tokenId,
        });
      }

      user.payoutMethods.push({
        type: "card",
        brand: brand.toLowerCase(),
        last4,
        cardNumber: `************${last4}`,
        stripeCardId: tokenId,
        isDefault,
      });
    }

    /* =======================
       BANK ACCOUNT PAYOUT
    ======================= */
    if (type === "bank_account") {
      if (
        !bankAccount?.accountNumber ||
        !bankAccount?.routingNumber ||
        !bankAccount?.bankName ||
        !bankAccount?.country ||
        !bankAccount?.currency
      ) {
        return res.status(400).json({ error: "Incomplete bank details" });
      }

      user.payoutMethods.push({
        type: "bank_account",
        bankAccount: {
          bankName: bankAccount.bankName,
          country: bankAccount.country,
          currency: bankAccount.currency,
          accountNumber: bankAccount.accountNumber,
          routingNumber: bankAccount.routingNumber,
          last4: bankAccount.accountNumber.slice(-4),
        },
        isDefault,
      });
    }

    await user.save();

    res.status(201).json({
      success: true,
      payoutMethods: user.payoutMethods.map((m) => ({
        _id: m._id,
        type: m.type,
        brand: m.brand,
        last4: m.last4 || m.bankAccount?.last4,
        isDefault: m.isDefault,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    console.error("Add payout method error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
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
