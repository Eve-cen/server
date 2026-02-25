const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const sendEmail = require("./sendEmail");

async function makeUserHost(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Pick the default bank payout if exists, otherwise any bank
  const bankPayout =
    user.payoutMethods.find((m) => m.isDefault && m.type === "bank_account") ||
    user.payoutMethods.find((m) => m.type === "bank_account");

  if (!bankPayout || !bankPayout.bankAccount) {
    throw new Error(
      "No bank account available. Add a bank account to receive payouts."
    );
  }

  // // Mark user as host
  user.isHost = true;

  // // Create Stripe Custom account
  const account = await stripe.accounts.create({
    type: "custom",
    country: user.address?.country || "US",
    email: user.email,
    business_type: user.businessType || "individual",
    business_profile: {
      mcc: user.mcc || "7999",
      url: user.website || "https://vencome.netlify.app",
    },
    individual: {
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      phone: user.phoneNumber,
      dob: {
        day: user.dob?.day,
        month: user.dob?.month,
        year: user.dob?.year,
      },
      address: {
        line1: user.address?.streetAddress,
        line2: user.address?.floor,
        city: user.address?.city,
        state: user.address?.state,
        postal_code: user.address?.postalCode,
        country: user.address?.country,
      },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: bankPayout.clientIp, // pass the real host IP here
    },
  });

  // Add bank account to the newly created Stripe account
  if (bankPayout.stripeTokenId) {
    // ✅ IBAN / SEPA
    await stripe.accounts.createExternalAccount(account.id, {
      external_account: bankPayout.stripeTokenId,
    });
  } else {
    // ✅ US / non-IBAN
    await stripe.accounts.createExternalAccount(account.id, {
      external_account: {
        object: "bank_account",
        country: bankPayout.bankAccount.country,
        currency: bankPayout.bankAccount.currency.toLowerCase(),
        account_holder_name: `${user.firstName} ${user.lastName}`,
        account_holder_type: "individual",
        routing_number: bankPayout.bankAccount.routingNumber,
        account_number: bankPayout.bankAccount.accountNumber,
      },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: "https://vencome.netlify.app/",
    return_url: "https://vencome.netlify.app/",
    type: "account_onboarding",
  });

  await sendEmail({
    to: user.email,
    subject: "Complete your identity verification",
    html: `
     <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Header / Logo -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
      <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px; height: auto;">
    </div>

    <!-- Body -->
    <div style="padding: 30px; color: #333;">
      <h2 style="color: #305CDE; margin-top: 0;">Hi ${user.firstName},</h2>
      <p>To receive payouts, please complete your identity verification by clicking the button below:</p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${accountLink.url}" target="_blank" rel="noopener noreferrer"
           style="background-color: #305CDE; color: #ffffff; text-decoration: none; padding: 18px 30px; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
          Complete Verification
        </a>
      </div>

      <p style="font-size: 14px; color: #666;">This link expires shortly. If it does, you can request a new one.</p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      © ${new Date().getFullYear()} VenCome. All rights reserved.
    </div>
  </div>
</div>

    `,
  });

  console.log(accountLink);

  // Save Stripe account ID to user
  user.stripeAccountId = account.id;
  user.stripeOnboardingStatus = "pending";
  await user.save();

  return user;
}

module.exports = makeUserHost;
