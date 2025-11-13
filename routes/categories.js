const express = require("express");
const Category = require("../models/Category");
const Property = require("../models/Property"); // 👈 import Property model
const router = express.Router();

// ✅ Create a new category
router.post("/", async (req, res) => {
  const { name } = req.body;

  try {
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const category = new Category({ name });
    const savedCategory = await category.save();
    res.status(201).json(savedCategory);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get all categories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get one category and all its properties
router.get("/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find properties that belong to this category
    const properties = await Property.find({ category: req.params.id })
      .populate("host", "name email") // Optional: populate host info
      .select("-__v"); // Exclude extra fields like __v

    res.json({ category, properties });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
