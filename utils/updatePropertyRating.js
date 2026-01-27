// /server/utils/updatePropertyRating.js
const Review = require("../models/Review");
const Property = require("../models/Property");

async function updatePropertyRating(propertyId) {
  const reviews = await Review.find({ property: propertyId });

  if (reviews.length === 0) {
    await Property.findByIdAndUpdate(propertyId, { averageRating: 0 });
    return;
  }

  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avg = total / reviews.length;

  await Property.findByIdAndUpdate(propertyId, { averageRating: avg });
}

module.exports = updatePropertyRating;
