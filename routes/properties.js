const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Property = require("../models/Property");
const Category = require("../models/Category");
const auth = require("../middleware/auth");
const uploadToR2 = require("../utils/uploadService");
const { deleteFromR2 } = require("../utils/uploadService");

const router = express.Router();

// Configure multer storage for temporary files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
});

// Helper function to upload multiple files to R2
const uploadFilesToR2 = async (files) => {
  const uploadPromises = files.map(async (file) => {
    console.log(file);
    try {
      const result = await uploadToR2(file.path, file.filename);
      return result.location; // Returns the R2 URL
    } catch (error) {
      console.error(`Error uploading ${file.filename}:`, error);
      // Clean up local file if it still exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw error;
    }
  });

  return await Promise.all(uploadPromises);
};

// Helper function to delete files from R2
const deleteFilesFromR2 = async (imageUrls) => {
  const deletePromises = imageUrls.map(async (url) => {
    try {
      // Extract filename from URL
      const filename = url.split("/").pop();
      await deleteFromR2(filename);
    } catch (error) {
      console.error(`Error deleting ${url}:`, error);
    }
  });

  await Promise.all(deletePromises);
};

// ====================== ROUTES ======================

// ✅ Create a new property listing (with R2 upload)
router.post("/", auth, upload.array("images", 45), async (req, res) => {
  try {
    console.log("Received property creation request");
    console.log("Body:", req.body);
    console.log("Files:", req.files.length || 0);

    // Parse JSON strings from FormData
    let location, coordinates, features, extras, pricing, bookingSettings;
    try {
      location = JSON.parse(req.body.location);
      coordinates = JSON.parse(req.body.coordinates);
      features = JSON.parse(req.body.features);
      extras = JSON.parse(req.body.extras || "[]");
      pricing = JSON.parse(req.body.pricing);
      bookingSettings = JSON.parse(req.body.bookingSettings);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);

      // Clean up uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      return res.status(400).json({
        error: "Invalid JSON format in request body",
        details: parseError.message,
      });
    }

    const { title, description, category } = req.body;
    const host = req.user.id;

    // Validate required fields
    if (!title || !description) {
      // Clean up uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      return res.status(400).json({
        error: "Missing required fields: title and description are required",
      });
    }

    // Validate category if provided
    if (category && category.trim()) {
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) {
        // Clean up uploaded files
        if (req.files && req.files.length > 0) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(404).json({ error: "Category not found" });
      }
    }

    // Upload images to R2
    let r2ImageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        console.log("Uploading images to R2...");
        r2ImageUrls = await uploadFilesToR2(req.files);
        console.log(`Successfully uploaded ${r2ImageUrls.length} images to R2`);
      } catch (uploadError) {
        console.error("Error uploading to R2:", uploadError);
        return res.status(500).json({
          error: "Failed to upload images",
          details: uploadError.message,
        });
      }
    }

    const coverImage = r2ImageUrls.length > 0 ? r2ImageUrls[0] : null;

    console.log("Creating property with data:", {
      title,
      imagesCount: r2ImageUrls.length,
      host,
    });

    // Create property document with R2 URLs
    const property = new Property({
      title,
      description,
      location,
      coordinates,
      images: r2ImageUrls, // Store R2 URLs instead of local paths
      coverImage: coverImage,
      features,
      extras: extras || [],
      pricing,
      bookingSettings,
      host,
      category: category && category.trim() ? category : undefined,
    });

    const savedProperty = await property.save();
    console.log("Property created successfully:", savedProperty._id);

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      property: savedProperty,
    });
  } catch (err) {
    console.error("Error creating property:", err);

    // Clean up temporary files if they still exist
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkError) {
            console.error("Error deleting temp file:", unlinkError);
          }
        }
      });
    }

    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

// ✅ Get all properties
router.get("/", async (req, res) => {
  try {
    const properties = await Property.find()
      .populate("host", "email name")
      .populate("category", "name")
      .sort({ createdAt: -1 }); // Most recent first

    res.json({
      success: true,
      count: properties.length,
      properties,
    });
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Search properties
router.get("/search", async (req, res) => {
  const { location, category, minPrice, maxPrice, checkIn, checkOut } =
    req.query;

  try {
    let query = {};

    // Filter by location (search in address, city, or country)
    if (location) {
      query.$or = [
        { "location.address": { $regex: new RegExp(location, "i") } },
        { "location.city": { $regex: new RegExp(location, "i") } },
        { "location.country": { $regex: new RegExp(location, "i") } },
      ];
    }

    // Filter by category
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
      query.category = category;
    }

    // Filter by price range (using weekdayPrice)
    if (minPrice || maxPrice) {
      query["pricing.weekdayPrice"] = {};
      if (minPrice) query["pricing.weekdayPrice"].$gte = Number(minPrice);
      if (maxPrice) query["pricing.weekdayPrice"].$lte = Number(maxPrice);
    }

    // TODO: Implement proper availability check with checkIn/checkOut dates
    if (checkIn && checkOut) {
      console.log(`Date filtering requested: ${checkIn} to ${checkOut}`);
      // This would require checking against bookings
    }

    const properties = await Property.find(query)
      .populate("host", "email name")
      .populate("category", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: properties.length,
      properties,
    });
  } catch (err) {
    console.error("Error searching properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Get property by ID
router.get("/:id", async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate("host", "email name")
      .populate("category", "name");

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.json({
      success: true,
      property,
    });
  } catch (err) {
    console.error("Error fetching property:", err);

    // Handle invalid ObjectId format
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }

    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Update a property (with R2 upload)
router.put("/:id", auth, upload.array("images", 45), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      // Clean up uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      return res.status(404).json({ error: "Property not found" });
    }

    // Check authorization
    if (property.host.toString() !== req.user.id) {
      // Clean up uploaded files
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    // Parse JSON fields if they exist
    let location, coordinates, features, extras, pricing, bookingSettings;

    if (req.body.location) {
      try {
        location = JSON.parse(req.body.location);
      } catch (e) {
        return res.status(400).json({ error: "Invalid location format" });
      }
    }

    if (req.body.coordinates) {
      try {
        coordinates = JSON.parse(req.body.coordinates);
      } catch (e) {
        return res.status(400).json({ error: "Invalid coordinates format" });
      }
    }

    if (req.body.features) {
      try {
        features = JSON.parse(req.body.features);
      } catch (e) {
        return res.status(400).json({ error: "Invalid features format" });
      }
    }

    if (req.body.extras) {
      try {
        extras = JSON.parse(req.body.extras);
      } catch (e) {
        return res.status(400).json({ error: "Invalid extras format" });
      }
    }

    if (req.body.pricing) {
      try {
        pricing = JSON.parse(req.body.pricing);
      } catch (e) {
        return res.status(400).json({ error: "Invalid pricing format" });
      }
    }

    if (req.body.bookingSettings) {
      try {
        bookingSettings = JSON.parse(req.body.bookingSettings);
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Invalid bookingSettings format" });
      }
    }

    const { title, description, category } = req.body;

    // Validate category if provided
    if (category && category.trim()) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ error: "Invalid category ID" });
      }
    }

    // Handle new uploaded images to R2
    let newR2Urls = [];
    if (req.files && req.files.length > 0) {
      try {
        console.log("Uploading new images to R2...");
        newR2Urls = await uploadFilesToR2(req.files);
        console.log(
          `Successfully uploaded ${newR2Urls.length} new images to R2`
        );

        // Append to existing images
        property.images = [...property.images, ...newR2Urls];

        // Set cover image if none exists
        if (!property.coverImage) {
          property.coverImage = newR2Urls[0];
        }
      } catch (uploadError) {
        console.error("Error uploading to R2:", uploadError);
        return res.status(500).json({
          error: "Failed to upload images",
          details: uploadError.message,
        });
      }
    }

    // Update fields if provided
    if (title) property.title = title;
    if (description) property.description = description;
    if (location) property.location = location;
    if (coordinates) property.coordinates = coordinates;
    if (features) property.features = features;
    if (extras) property.extras = extras;
    if (pricing) property.pricing = pricing;
    if (bookingSettings) property.bookingSettings = bookingSettings;
    if (category) property.category = category;

    const updatedProperty = await property.save();

    res.json({
      success: true,
      message: "Property updated successfully",
      property: updatedProperty,
    });
  } catch (err) {
    console.error("Error updating property:", err);

    // Clean up temporary files if they still exist
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkError) {
            console.error("Error deleting temp file:", unlinkError);
          }
        }
      });
    }

    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Delete a property (with R2 cleanup)
router.delete("/:id", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Check authorization
    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    // Delete associated images from R2
    if (property.images && property.images.length > 0) {
      try {
        console.log(`Deleting ${property.images.length} images from R2...`);
        await deleteFilesFromR2(property.images);
        console.log("Images deleted from R2 successfully");
      } catch (deleteError) {
        console.error("Error deleting images from R2:", deleteError);
        // Continue with property deletion even if image deletion fails
      }
    }

    await property.deleteOne();

    res.json({
      success: true,
      message: "Property deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting property:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Delete specific images from a property
router.delete("/:id/images", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Check authorization
    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    const { imageUrls } = req.body; // Array of image URLs to delete

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        error: "Please provide an array of image URLs to delete",
      });
    }

    // Delete from R2
    try {
      await deleteFilesFromR2(imageUrls);
    } catch (deleteError) {
      console.error("Error deleting from R2:", deleteError);
      return res.status(500).json({
        error: "Failed to delete images from storage",
      });
    }

    // Remove from property document
    property.images = property.images.filter((img) => !imageUrls.includes(img));

    // Update cover image if it was deleted
    if (imageUrls.includes(property.coverImage)) {
      property.coverImage =
        property.images.length > 0 ? property.images[0] : null;
    }

    await property.save();

    res.json({
      success: true,
      message: "Images deleted successfully",
      property,
    });
  } catch (err) {
    console.error("Error deleting images:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
