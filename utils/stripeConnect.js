const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

async function makeUserHost(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // console.log(user);
  // const bankPayoutMethod = user.payoutMethods.find(
  //   (m) => m.type === "bank_account"
  // );

  // if (!bankPayoutMethod) {
  //   return console.error("No bank payout method found");
  // }

  // // Mark user as host
  // user.isHost = true;

  // // Create Custom account
  // const account = await stripe.accounts.create({
  //   type: "custom",
  //   country: user.address.country || "US", // ISO country code
  //   email: user.email,
  //   business_type: user.businessType || "individual",
  //   business_profile: {
  //     mcc: user.mcc || "7999", // default: misc services
  //     url: user.website || "https://vencome.netlify.app",
  //   },
  //   individual: {
  //     first_name: user.firstName,
  //     last_name: user.lastName,
  //     email: user.email,
  //     phone: user.phone,
  //     dob: {
  //       day: user.dob.day,
  //       month: user.dob.month,
  //       year: user.dob.year,
  //     },
  //     address: {
  //       line1: user.address.streetAddress,
  //       line2: user.address.floor,
  //       city: user.address.city,
  //       state: user.address.state,
  //       postal_code: user.address.postalCode,
  //       country: user.address.country,
  //     },
  //   },
  //   capabilities: {
  //     card_payments: { requested: true },
  //     transfers: { requested: true },
  //   },
  //   tos_acceptance: {
  //     date: Math.floor(Date.now() / 1000),
  //     ip: "10.69.42.79", // host IP
  //   },
  // });

  // // Add bank account to Custom account
  // if (user.payoutMethods) {
  //   await stripe.accounts.createExternalAccount(user.stripeAccountId, {
  //     external_account: {
  //       object: "bank_account",
  //       country: bankPayoutMethod.bankAccount.country,
  //       currency: bankPayoutMethod.bankAccount.currency,
  //       account_holder_name: `${user.firstName} ${user.lastName}`,
  //       account_holder_type: "individual",
  //       routing_number: bankPayoutMethod.bankAccount.routingNumber,
  //       account_number: bankPayoutMethod.bankAccount.accountNumber,
  //     },
  //   });
  // }

  // user.stripeAccountId = account.id;
  // await user.save();

  // return user;
}

module.exports = makeUserHost;
