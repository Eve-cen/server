const { body } = require("express-validator");

module.exports = [
  body("pricing.pricingType")
    .isIn(["DAILY", "HOURLY"])
    .withMessage("Pricing type must be DAILY or HOURLY"),

  body("pricing.weekdayPrice")
    .if(body("pricing.pricingType").equals("DAILY"))
    .isFloat({ min: 0 })
    .withMessage("Weekday price is required"),

  body("pricing.hourlyPrice")
    .if(body("pricing.pricingType").equals("HOURLY"))
    .isFloat({ min: 0 })
    .withMessage("Hourly price is required"),
];
