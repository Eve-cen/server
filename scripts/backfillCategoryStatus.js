// One-time fix: existing Category docs predate the `status` field, so it's
// missing from the stored document entirely (not defaulted — Mongoose only
// applies schema defaults on hydration, not on raw find() query filters).
// That's why GET /categories (status: "published") was returning [] even
// though the admin panel showed everything as "Published" (admin reads via
// a hydrated, non-lean Mongoose document, which fakes the default in-memory).
require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const Category = require("../models/Category");

mongoose
  .connect(process.env.DATABASE)
  .then(async () => {
    console.log("Connected to:", mongoose.connection.db.databaseName);

    const result = await Category.updateMany(
      { status: { $exists: false } },
      { $set: { status: "published" } }
    );

    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
