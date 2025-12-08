// utils/pricing.js
module.exports.calculatePrice = function (property, booking) {
  const { pricing } = property;

  if (pricing.pricingType === "HOURLY") {
    const hours =
      (new Date(booking.endTime) - new Date(booking.startTime)) / 36e5;

    if (hours < pricing.minHours) {
      throw new Error("Minimum hourly booking not met");
    }

    return pricing.hourlyPrice * Math.ceil(hours);
  }

  return pricing.weekdayPrice * booking.days;
};
