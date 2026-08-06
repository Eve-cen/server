// Auto-reveals blind reviews that never got a counterpart within 14 days,
// so a review doesn't stay hidden forever just because the other side never
// wrote one back. Run daily from server.js alongside the other cron jobs.
const Review = require("../models/Review");
const updatePropertyRating = require("./updatePropertyRating");

async function revealPastDueReviews() {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const stale = await Review.find({
    revealed: false,
    createdAt: { $lte: cutoff },
  }).select("_id property");

  if (!stale.length) return;

  const ids = stale.map((r) => r._id);
  await Review.updateMany({ _id: { $in: ids } }, { revealed: true });

  const propertyIds = [...new Set(stale.map((r) => String(r.property)))];
  for (const propertyId of propertyIds) {
    await updatePropertyRating(propertyId).catch((err) =>
      console.error(`[Review Reveal] Failed to resync property ${propertyId}:`, err.message)
    );
  }

  console.log(`[Review Reveal] Auto-revealed ${stale.length} past-due review(s)`);
}

module.exports = revealPastDueReviews;
