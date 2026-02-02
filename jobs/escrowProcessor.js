// jobs/escrowProcessor.js
import Payment from "../models/Payment.js";
import Payout from "../models/Payout.js";

export const processEscrowReleases = async () => {
  const now = new Date();

  const payments = await Payment.find({
    status: "paid",
    escrowReleaseAt: { $lte: now },
  });

  for (const payment of payments) {
    // Create payout
    const payout = await Payout.create({
      host: payment.host,
      payment: payment._id,
      amount: payment.hostAmount,
      provider: payment.provider,
    });

    // TODO: Call payment provider payout API here
    // stripe.transfers.create(...)
    // paystack.transfer.create(...)

    payout.status = "paid";
    payout.processedAt = new Date();
    await payout.save();

    // Prevent double payout
    payment.status = "refunded"; // or "settled" if you prefer
    await payment.save();
  }
};
