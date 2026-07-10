const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    excerpt: { type: String, required: true, maxlength: 300 },
    content: { type: String, required: true },
    coverImage: { type: String, default: null },
    category: {
      type: String,
      enum: ["News", "Guides", "Industry", "Tips", "Updates", "Case Studies"],
      default: "News",
    },
    tags: [{ type: String }],
    author: { type: String, default: "VenCome Team" },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
    readTime: { type: Number, default: 5 },
    views: { type: Number, default: 0 },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    ogImage: { type: String, default: "" },
  },
  { timestamps: true }
);

blogSchema.index({ slug: 1 });
blogSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model("Blog", blogSchema);
