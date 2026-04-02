// utils/rankingScore.js

const WEIGHTS = {
  views: 0.15,
  bookings: 0.25,
  rating: 0.2,
  price: 0.1,
  featured: 0.15,
  ads: 0.15,
};

export const computeRankingScore = (property, maxValues) => {
  const viewScore = (property.views || 0) / (maxValues.views || 1);
  const bookingScore = (property.bookings || 0) / (maxValues.bookings || 1);
  const ratingScore = (property.rating || 0) / 5; // assuming 5-star max
  const priceScore = 1 - (property.price || 0) / (maxValues.price || 1); // lower price = higher score
  const featuredScore = property.isFeatured ? 1 : 0;
  const adsScore = property.hasActiveAd ? 1 : 0;

  return (
    WEIGHTS.views * viewScore +
    WEIGHTS.bookings * bookingScore +
    WEIGHTS.rating * ratingScore +
    WEIGHTS.price * priceScore +
    WEIGHTS.featured * featuredScore +
    WEIGHTS.ads * adsScore
  );
};
