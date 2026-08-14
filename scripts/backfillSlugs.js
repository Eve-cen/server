// One-time fix: Property/Category docs created before the slug feature
// existed have no `slug` field, so their /property/:id and /category/:id
// URLs still show the raw ObjectId. Generates and saves a slug for every
// row currently missing one, one at a time (generateUniqueSlug needs to see
// each prior save to avoid collisions).
require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const Property = require("../models/Property");
const Category = require("../models/Category");
const { generateUniqueSlug } = require("../utils/slugify");

mongoose
  .connect(process.env.DATABASE)
  .then(async () => {
    console.log("Connected to:", mongoose.connection.db.databaseName);

    const properties = await Property.find({ slug: { $exists: false } });
    for (const property of properties) {
      property.slug = await generateUniqueSlug(Property, property.title);
      await property.save();
    }
    console.log(`Properties backfilled: ${properties.length}`);

    const categories = await Category.find({ slug: { $exists: false } });
    for (const category of categories) {
      category.slug = await generateUniqueSlug(Category, category.name);
      await category.save();
    }
    console.log(`Categories backfilled: ${categories.length}`);

    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
