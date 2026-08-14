const mongoose = require("mongoose");

const subCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true }, // <--- MAKE SURE THIS LINE EXISTS
  },
  { timestamps: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    // URL-friendly identifier for /category/:slug -- same pattern as
    // Property.slug, generated from name at creation; backfillCategorySlugs.js
    // fills existing rows.
    slug: { type: String, unique: true, sparse: true, trim: true },
    image: {
      type: String,
      default:
        "https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500",
    },
    subcategories: [subCategorySchema],
    description: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "published" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
