// const express = require("express");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");
// const Property = require("../models/Property");
// const Category = require("../models/Category");
// const auth = require("../middleware/auth");

// const router = express.Router();

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, "uploads/"),
//   filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
// });

// const upload = multer({ storage });

// // ====================== ROUTES ======================

// // ✅ Create a new property listing (with images)
// router.post("/", auth, upload.array("images", 45), async (req, res) => {
//   try {
//     const {
//       title,
//       description,
//       location,
//       coordinates,
//       features,
//       extras,
//       pricing,
//       bookingSettings,
//       category,
//     } = req.body;

//     const host = req.user.id;

//     // Validate category
//     // if (category) {
//     //   const categoryDoc = await Category.findById(category);
//     //   if (!categoryDoc) {
//     //     return res.status(404).json({ error: "Category not found" });
//     //   }
//     // }

//     if (category && category.trim()) {
//       const categoryDoc = await Category.findById(category);
//       if (!categoryDoc) {
//         return res.status(404).json({ error: "Category not found" });
//       }
//     }

//     // Map uploaded images
//     const uploadedImages = req.files.map((file) => `/uploads/${file.filename}`);
//     const coverImage = uploadedImages.length > 0 ? uploadedImages[0] : null;

//     const property = new Property({
//       title,
//       description,
//       location,
//       coordinates,
//       images: uploadedImages, // use uploaded images
//       coverImage: coverImage,
//       features,
//       extras: extras || [],
//       pricing,
//       bookingSettings,
//       host,
//       category,
//     });

//     const savedProperty = await property.save();
//     res.status(201).json(savedProperty);
//   } catch (err) {
//     console.error("Error creating property:", err);
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });

// // ✅ Get all properties
// router.get("/", async (req, res) => {
//   try {
//     const properties = await Property.find()
//       .populate("host", "email name")
//       .populate("category", "name");
//     res.json(properties);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // ✅ Search properties
// router.get("/search", async (req, res) => {
//   const { location, category, minPrice, maxPrice, checkIn, checkOut } =
//     req.query;

//   try {
//     let query = {};

//     if (location) {
//       query.location = { $regex: new RegExp(location, "i") };
//     }

//     if (category) {
//       const categoryExists = await Category.findById(category);
//       if (!categoryExists) {
//         return res.status(400).json({ error: "Invalid category ID" });
//       }
//       query.category = category;
//     }

//     if (minPrice || maxPrice) {
//       query.price = {};
//       if (minPrice) query.price.$gte = Number(minPrice);
//       if (maxPrice) query.price.$lte = Number(maxPrice);
//     }

//     if (checkIn && checkOut) {
//       console.log(`Check-in: ${checkIn}, Check-out: ${checkOut}`);
//     }

//     const properties = await Property.find(query)
//       .populate("host", "email name")
//       .populate("category", "name");

//     res.json(properties);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // ✅ Get property by ID
// router.get("/:id", async (req, res) => {
//   try {
//     const property = await Property.findById(req.params.id)
//       .populate("host", "email name")
//       .populate("category", "name");
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }
//     res.json(property);
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // ✅ Update a property
// router.put("/:id", auth, upload.array("images", 45), async (req, res) => {
//   try {
//     const property = await Property.findById(req.params.id);
//     if (!property) return res.status(404).json({ error: "Property not found" });

//     if (property.host.toString() !== req.user.id) {
//       return res
//         .status(403)
//         .json({ error: "Unauthorized: You are not the host of this property" });
//     }

//     const {
//       title,
//       description,
//       location,
//       coordinates,
//       features,
//       extras,
//       pricing,
//       bookingSettings,
//       category,
//     } = req.body;

//     // Handle uploaded images (append to existing)
//     if (req.files && req.files.length > 0) {
//       const newImages = req.files.map((file) => `/${file.path}`);
//       property.images = [...property.images, ...newImages];
//       if (!property.coverImage) property.coverImage = newImages[0];
//     }

//     // Update fields
//     if (title) property.title = title;
//     if (description) property.description = description;
//     if (location) property.location = location;
//     if (coordinates) property.coordinates = coordinates;
//     if (features) property.features = features;
//     if (extras) property.extras = extras;
//     if (pricing) property.pricing = pricing;
//     if (bookingSettings) property.bookingSettings = bookingSettings;
//     if (category) property.category = category;

//     const updatedProperty = await property.save();
//     res.json(updatedProperty);
//   } catch (err) {
//     console.error("Error updating property:", err);
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });

// // ✅ Delete a property
// router.delete("/:id", auth, async (req, res) => {
//   try {
//     const property = await Property.findById(req.params.id);
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     if (property.host.toString() !== req.user.id) {
//       return res
//         .status(403)
//         .json({ error: "Unauthorized: You are not the host of this property" });
//     }

//     await property.deleteOne();
//     res.json({ message: "Property deleted successfully" });
//   } catch (err) {
//     res.status(500).json({ error: "Server error" });
//   }
// });

// module.exports = router;

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Property = require("../models/Property");
const Category = require("../models/Category");
const auth = require("../middleware/auth");

const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    // Create uploads directory if it doesn't exist
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

// ====================== ROUTES ======================

// ✅ Create a new property listing (with images)
router.post("/", auth, upload.array("images", 45), async (req, res) => {
  try {
    console.log("Received property creation request");
    console.log("Body:", req.body);
    console.log("Files:", req.files?.length || 0);

    // ✅ FIXED: Parse JSON strings from FormData
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
      return res.status(400).json({
        error: "Invalid JSON format in request body",
        details: parseError.message,
      });
    }

    const { title, description, category } = req.body;
    const host = req.user.id;

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        error: "Missing required fields: title and description are required",
      });
    }

    // Validate category if provided
    if (category && category.trim()) {
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) {
        return res.status(404).json({ error: "Category not found" });
      }
    }

    // Map uploaded images with proper path
    const uploadedImages = (req.files || []).map(
      (file) => `/uploads/${file.filename}`
    );

    const coverImage = uploadedImages.length > 0 ? uploadedImages[0] : null;

    console.log("Creating property with data:", {
      title,
      imagesCount: uploadedImages.length,
      host,
    });

    // Create property document
    const property = new Property({
      title,
      description,
      location,
      coordinates,
      images: uploadedImages,
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

    // Delete uploaded files if property creation fails
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const filePath = path.join(__dirname, "..", file.path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
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

// ✅ Update a property
router.put("/:id", auth, upload.array("images", 45), async (req, res) => {
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

    // Handle new uploaded images (append to existing)
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => `/uploads/${file.filename}`);
      property.images = [...property.images, ...newImages];
      if (!property.coverImage) {
        property.coverImage = newImages[0];
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

    // Delete uploaded files if update fails
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const filePath = path.join(__dirname, "..", file.path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Delete a property
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

    // Delete associated images from filesystem
    if (property.images && property.images.length > 0) {
      property.images.forEach((imagePath) => {
        const fullPath = path.join(__dirname, "..", imagePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`Deleted image: ${fullPath}`);
          } catch (err) {
            console.error(`Error deleting image ${fullPath}:`, err);
          }
        }
      });
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

module.exports = router;
