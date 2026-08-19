// One-time fix: subcategories created before the slug feature existed have
// no `slug` field, so /:subcategorySlug/:locationSlug landing pages can't
// resolve them yet. Generates and saves a slug for every subcategory
// currently missing one, one document at a time (generateUniqueSlug needs
// to see each prior save to avoid collisions across the whole collection,
// since "subcategories.slug" uniqueness spans every category's array, not
// just the one being processed).
require("dotenv").config({ path: "./config.env" });
const mongoose = require("mongoose");
const Category = require("../models/Category");
const { generateUniqueSlug } = require("../utils/slugify");

mongoose
  .connect(process.env.DATABASE)
  .then(async () => {
    console.log("Connected to:", mongoose.connection.db.databaseName);

    const categories = await Category.find({});
    let backfilled = 0;

    for (const category of categories) {
      let changed = false;
      for (const sub of category.subcategories) {
        if (sub.slug) continue;
        sub.slug = await generateUniqueSlug(Category, sub.name, "subcategories.slug");
        changed = true;
        backfilled += 1;
      }
      if (changed) await category.save();
    }

    console.log(`Subcategories backfilled: ${backfilled}`);
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
