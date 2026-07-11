const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

// Creates a Stripe Connect Express account for a new host, if they dont
// already have one. Bank/personal details are collected by Stripes own
// hosted onboarding (see routes/payouts.js POST /onboarding-link) -- VenCome
// never collects or stores raw bank account numbers, so no bank-detail form
// is needed here or on the client.
async function makeUserHost(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  user.isHost = true;

  if (!user.stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: user.address?.country || "GB",
      email: user.email,
      business_type: user.businessType || "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    user.stripeAccountId = account.id;
    user.stripeOnboardingStatus = "pending";
  }

  await user.save();
  return user;
}

module.exports = makeUserHost;
