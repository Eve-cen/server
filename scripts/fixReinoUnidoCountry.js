// One-time fix: a host typed "Reino Unido" into the free-text Country
// field on the edit-listing page instead of "United Kingdom", splitting
// the Browse-by-City "London" facet into two separate country groups.
require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const Property = require("../models/Property");

mongoose
  .connect(process.env.DATABASE)
  .then(async () => {
    console.log("Connected to:", mongoose.connection.db.databaseName);

    const affected = await Property.find({ "location.country": "Reino Unido" });
    console.log(`Found ${affected.length} propert${affected.length === 1 ? "y" : "ies"} with location.country = "Reino Unido"`);
    for (const property of affected) {
      console.log(`- ${property._id}: ${property.title}`);
    }

    const result = await Property.updateMany(
      { "location.country": "Reino Unido" },
      { $set: { "location.country": "United Kingdom" } }
    );
    console.log(`Updated: ${result.modifiedCount}`);

    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
