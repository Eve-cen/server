const express = require("express");
const Property = require("../models/Property");
const Category = require("../models/Category");
const auth = require("../middleware/auth");
const router = express.Router();

// Get property details by ID (GET /api/properties/:id)
router.get("/:id", async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate("host", "email name") // Populate host details
      .populate("category", "name");
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Search properties (GET /api/properties/search)
router.get("/search", async (req, res) => {
  const { location, category, minPrice, maxPrice, checkIn, checkOut } =
    req.query;

  try {
    let query = {};

    // Filter by location (case-insensitive partial match)
    if (location) {
      query.location = { $regex: new RegExp(location, "i") };
    }

    // Filter by category
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      query.category = category;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Filter by date range (basic availability check - assumes properties are available unless specified)
    // Note: This is a placeholder; a full booking system would require a separate availability model
    if (checkIn && checkOut) {
      // For now, assume all properties are available; implement booking dates in a future iteration
      console.log(`Check-in: ${checkIn}, Check-out: ${checkOut}`);
    }

    const properties = await Property.find(query)
      .populate("host", "email")
      .populate("category", "name");

    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create a new property listing (POST /api/properties)
router.post("/", auth, async (req, res) => {
  const { title, description, price, location, image, rating, category } =
    req.body;

  try {
    // Basic validation
    if (!title || !description || !price || !location || !category) {
      return res.status(400).json({
        error: "Title, description, price, location, and category are required",
      });
    }

    // Validate category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    const property = new Property({
      title,
      description,
      price,
      location,
      image: image || "https://source.unsplash.com/random/400x300/?house",
      rating: rating || 0,
      host: req.user.id,
      category, // New field
    });

    const savedProperty = await property.save();
    res.status(201).json(savedProperty);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get all property listings (GET /api/properties)
router.get("/", async (req, res) => {
  try {
    const properties = await Property.find()
      .populate("host", "email")
      .populate("category", "name");
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update a property listing (PUT /api/properties/:id)
router.put("/:id", auth, async (req, res) => {
  const { id } = req.params;
  const { title, description, price, location, image, rating, category } =
    req.body;

  try {
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (property.host.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You are not the host of this property" });
    }

    // Validate category if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
    }

    property.title = title || property.title;
    property.description = description || property.description;
    property.price = price || property.price;
    property.location = location || property.location;
    property.image = image || property.image;
    property.rating = rating !== undefined ? rating : property.rating;
    property.category = category || property.category;

    if (
      !property.title ||
      !property.description ||
      !property.price ||
      !property.location ||
      !property.category
    ) {
      return res.status(400).json({
        error: "Title, description, price, location, and category are required",
      });
    }

    const updatedProperty = await property.save();
    res.json(updatedProperty);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a property listing (DELETE /api/properties/:id)
router.delete("/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (property.host.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You are not the host of this property" });
    }

    await property.deleteOne();
    res.json({ message: "Property deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
