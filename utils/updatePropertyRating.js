// /server/utils/updatePropertyRating.js
const Review = require("../models/Review");
const Property = require("../models/Property");

async function updatePropertyRating(propertyId) {
  const stats = await Review.aggregate([
    { $match: { property: propertyId } },
    {
      $group: {
        _id: "$property",
        avgRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
        reviewIds: { $push: "$_id" },
      },
    },
  ]);

  if (!stats.length) {
    await Property.findByIdAndUpdate(propertyId, {
      rating: 0,
      reviewNumber: 0,
      reviews: [],
    });
    return;
  }

  const { avgRating, reviewCount, reviewIds } = stats[0];

  await Property.findByIdAndUpdate(propertyId, {
    rating: Number(avgRating.toFixed(1)),
    reviewNumber: reviewCount,
    reviews: reviewIds, // ✅ FULL sync, no duplicates ever
  });
}

module.exports = updatePropertyRating;
