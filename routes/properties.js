const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Property = require("../models/Property");
const Category = require("../models/Category");
const auth = require("../middleware/auth");
const uploadToR2 = require("../utils/uploadService");
const { deleteFromR2 } = require("../utils/uploadService");
const validatePricing = require("../middleware/validatePricing");
const Draft = require("../models/Draft");
const User = require("../models/User");
const makeUserHost = require("../utils/stripeConnect");
const sendEmail = require("../utils/sendEmail");
const { client } = require("../utils/redisClient");

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
    fileSize: 5 * 1024 * 1024,
  }, // 5MB limit per file
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
router.post(
  "/",
  validatePricing,
  auth,
  upload.array("images", 45),
  async (req, res) => {
    try {
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
      // 1️⃣ Upload new images to R2
      let r2ImageUrls = [];
      if (req.files && req.files.length > 0) {
        try {
          r2ImageUrls = await uploadFilesToR2(req.files);
        } catch (uploadError) {
          console.error("Error uploading to R2:", uploadError);
          return res.status(500).json({
            error: "Failed to upload images",
            details: uploadError.message,
          });
        }
      }

      // 2️⃣ Get existing draft images (if any)
      let draftImages = [];
      if (req.body.draftId) {
        const draft = await Draft.findById(req.body.draftId);
        draftImages = draft?.images || [];
      }

      // 3️⃣ Filter out any removed images sent from frontend
      const removedImages = req.body.removedImages
        ? JSON.parse(req.body.removedImages)
        : [];

      draftImages = draftImages.filter(
        (img) => !removedImages.includes(img.filename)
      );

      // 4️⃣ Map uploaded URLs to image objects
      const newImages = r2ImageUrls.map((url, index) => ({
        url,
      }));

      // 5️⃣ Combine existing draft images + new uploads
      const allImages = [...draftImages.map((img) => img.url), ...r2ImageUrls];

      // 6️⃣ Set cover image
      const coverImage = allImages.length > 0 ? allImages[0] : null;

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }
      // 1. Check verification
      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: "You must verify your account before creating a property",
        });
      }

      // 2. Check required profile fields
      const requiredFields = [
        "lastName",
        "firstName",
        "phoneNumber",
        "address",
        "profileImage",
        "payoutMethods",
        "dob",
      ];

      const missingFields = requiredFields.filter(
        (field) => !user[field] || user[field].toString().trim() === ""
      );

      if (missingFields.length > 0) {
        return res.status(403).json({
          success: false,
          message: "Please complete your profile before creating a property",
          missingFields,
        });
      }

      // Create property document with R2 URLs
      const property = new Property({
        title,
        description,
        location,
        coordinates,
        images: allImages, // Store R2 URLs instead of local paths
        coverImage: coverImage,
        features,
        extras: extras || [],
        pricing,
        bookingSettings,
        host,
        category: category && category.trim() ? category : undefined,
      });

      // if (req.body.draftId) {
      //   const deletedDoc = await Draft.findOneAndDelete({
      //     _id: req.body.draftId,
      //     user: req.user.id,
      //   });
      // } else {
      //   console.log("No draftId provided in the request body.");
      // }

      const propertyCount = await Property.countDocuments({
        host: req.user.id,
      });

      // 3️⃣ If this is the first property, mark user as host & create Stripe account
      if (propertyCount < 1) {
        // This is the first property
        await makeUserHost(req.user.id);
        return;
      }

      const savedProperty = await property.save();

      res.status(201).json({
        success: true,
        message: "Property created successfully",
        property: savedProperty,
      });
      const displayName = user.displayName || user.firstName || "there";

      sendEmail({
        to: user.email,
        subject: "Your property has been created successfully 🎉",
        html: `
               <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

<!-- Header -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
  <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
</div>

<!-- Body -->
<div style="padding: 30px; color: #333;">
  <h2 style="color: #305CDE; text-align: center; margin-top: 0;">
    Property Created Successfully 🎉
  </h2>

  <p>Hi <strong>${displayName}</strong>,</p>

  <p>
    Your property has been successfully created on <strong>VenCome</strong>.
    Here are the details:
  </p>

  <!-- Property Summary -->
  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #666;">Property name</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.title || "—"}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Location</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.location.city || ""}${
          property.location.country ? `, ${property.location.country}` : ""
        }
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Created on</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${new Date(property.createdAt).toLocaleDateString()}
        </td>
      </tr>
    </table>
  </div>

  <p>
    You can now update availability, pricing, and amenities from your dashboard.
  </p>

  <p style="margin-bottom: 0;">
    If you didn’t create this property, please contact our support team immediately.
  </p>
</div>

<!-- Footer -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
  This is an automated message, please do not reply.<br />
  © ${new Date().getFullYear()} VenCome. All rights reserved.
</div>

  </div>
</div>

              `,
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
  }
);

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
// router.get("/search", async (req, res) => {
//   const { location, category, minPrice, maxPrice, checkIn, checkOut } =
//     req.query;

//   try {
//     let query = {};

//     // Filter by location (search in address, city, or country)
//     if (location) {
//       query.$or = [
//         { "location.address": { $regex: new RegExp(location, "i") } },
//         { "location.city": { $regex: new RegExp(location, "i") } },
//         { "location.country": { $regex: new RegExp(location, "i") } },
//       ];
//     }

//     // Filter by category
//     if (category) {
//       const categoryExists = await Category.findById(category);
//       if (!categoryExists) {
//         return res.status(400).json({ error: "Invalid category ID" });
//       }
//       query.category = category;
//     }

//     // Filter by price range (using weekdayPrice)
//     if (minPrice || maxPrice) {
//       query["pricing.weekdayPrice"] = {};
//       if (minPrice) query["pricing.weekdayPrice"].$gte = Number(minPrice);
//       if (maxPrice) query["pricing.weekdayPrice"].$lte = Number(maxPrice);
//     }

//     // TODO: Implement proper availability check with checkIn/checkOut dates
//     if (checkIn && checkOut) {
//       console.log(`Date filtering requested: ${checkIn} to ${checkOut}`);
//       // This would require checking against bookings
//     }

//     const properties = await Property.find(query)
//       .populate("host", "email name")
//       .populate("category", "name")
//       .sort({ createdAt: -1 });

//     res.json({
//       success: true,
//       count: properties.length,
//       properties,
//     });
//   } catch (err) {
//     console.error("Error searching properties:", err);
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });

router.get("/search", async (req, res) => {
  const { location, category, minPrice, maxPrice, checkIn, checkOut } =
    req.query;

  // Create a unique cache key for this query
  const cacheKey = `search:${location || "all"}:${category || "all"}:${
    minPrice || 0
  }:${maxPrice || 0}:${checkIn || "none"}:${checkOut || "none"}`;

  try {
    // 1️⃣ Check Redis cache first
    const cached = await client.get(cacheKey);
    if (cached) {
      return res.json({ success: true, ...JSON.parse(cached), cached: true });
    }

    // 2️⃣ Build MongoDB query
    let query = {};
    if (location) {
      query.$or = [
        { "location.address": { $regex: new RegExp(location, "i") } },
        { "location.city": { $regex: new RegExp(location, "i") } },
        { "location.country": { $regex: new RegExp(location, "i") } },
      ];
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists)
        return res.status(400).json({ error: "Invalid category ID" });
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query["pricing.weekdayPrice"] = {};
      if (minPrice) query["pricing.weekdayPrice"].$gte = Number(minPrice);
      if (maxPrice) query["pricing.weekdayPrice"].$lte = Number(maxPrice);
    }

    // TODO: Implement proper availability filtering

    const properties = await Property.find(query)
      .populate("host", "email name")
      .populate("category", "name")
      .sort({ createdAt: -1 });

    const responsePayload = {
      count: properties.length,
      properties,
    };

    // 3️⃣ Cache the result for 10 minutes (600 seconds)
    await client.setEx(cacheKey, 600, JSON.stringify(responsePayload));

    res.json({ success: true, ...responsePayload, cached: false });
  } catch (err) {
    console.error("Error searching properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Get property by ID
// router.get("/:id", async (req, res) => {
//   try {
//     const property = await Property.findById(req.params.id)
//       .populate("host", "email name")
//       .populate("category", "name")
//       .populate({
//         path: "reviews",
//         populate: {
//           path: "user",
//           select: "name avatar",
//         },
//       });

//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     res.json({
//       success: true,
//       property,
//     });
//   } catch (err) {
//     console.error("Error fetching property:", err);

//     // Handle invalid ObjectId format
//     if (err.name === "CastError") {
//       return res.status(400).json({ error: "Invalid property ID format" });
//     }

//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });

router.get("/:id", async (req, res) => {
  const propertyId = req.params.id;

  try {
    // 1️⃣ Check Redis cache first
    const cached = await client.get(`property:${propertyId}`);
    if (cached) {
      return res.json({
        success: true,
        property: JSON.parse(cached),
        cached: true,
      });
    }

    // 2️⃣ Fetch from DB
    const property = await Property.findById(propertyId)
      .populate("host", "email name")
      .populate("category", "name")
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "name avatar",
        },
      });

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // 3️⃣ Cache property for 1 hour (3600s)
    await client.setEx(
      `property:${propertyId}`,
      3600,
      JSON.stringify(property)
    );

    res.json({ success: true, property, cached: false });
  } catch (err) {
    console.error("Error fetching property:", err);

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

    res.status(204).send();

    const user = await User.findById(req.user.id);
    const displayName = user.displayName || user.firstName || "there";

    sendEmail({
      to: user.email,
      subject: "Your property has been deleted",
      html: `
    <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4fpx 12px rgba(0,0,0,0.05);">

<!-- Header -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
  <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
</div>

<!-- Body -->
<div style="padding: 30px; color: #333;">
  <h2 style="color: #305CDE; text-align: center; margin-top: 0;">
    Property Deleted
  </h2>

  <p>Hi <strong>${displayName}</strong>,</p>

  <p>
    This is to confirm that the following property has been successfully deleted from your VenCome account:
  </p>

  <!-- Property Summary -->
  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #666;">Property name</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.title || "—"}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Location</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${property.location.city || ""}${
        property.location.country ? `, ${property.location.country}` : ""
      }
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #666;">Deleted on</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">
          ${new Date().toLocaleDateString()}
        </td>
      </tr>
    </table>
  </div>

  <p>
    Once a property is deleted, it is no longer visible or bookable on VenCome.
  </p>

  <p style="margin-bottom: 0;">
    You can create a new property at any time from your dashboard.
  </p>
</div>

<!-- Footer -->
<div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
  This is an automated message, please do not reply.<br />
  © ${new Date().getFullYear()} VenCome. All rights reserved.
</div>

  </div>
</div>`,
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
