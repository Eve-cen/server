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
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only image, PDF, DOC, and DOCX files are allowed!"),
        false
      );
    }
    cb(null, true);
  },
});

// ====================== HELPERS ======================

const cleanupTempFiles = (files) => {
  files?.forEach((file) => {
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error("Error deleting temp file:", e);
      }
    }
  });
};

const uploadFilesToR2 = async (files) => {
  const uploadPromises = files.map(async (file) => {
    try {
      const result = await uploadToR2(file.path, file.filename);
      return result.location;
    } catch (error) {
      console.error(`Error uploading ${file.filename}:`, error);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw error;
    }
  });
  return await Promise.all(uploadPromises);
};

const deleteFilesFromR2 = async (imageUrls) => {
  const deletePromises = imageUrls.map(async (url) => {
    try {
      const filename = url.split("/").pop();
      await deleteFromR2(filename);
    } catch (error) {
      console.error(`Error deleting ${url}:`, error);
    }
  });
  await Promise.all(deletePromises);
};

// ====================== ROUTES ======================

// ✅ Create a property
router.post(
  "/",
  auth, // reject unauthenticated first
  validatePricing,
  upload.fields([
    { name: "images", maxCount: 45 },
    { name: "cqcDocuments", maxCount: 10 },
    { name: "leaseFile", maxCount: 1 }, // ✅ NEW: Added lease file field
  ]),
  async (req, res) => {
    try {
      // ── Parse JSON safely ──
      let location,
        coordinates,
        features,
        extras,
        pricing,
        bookingSettings,
        blockedDates,
        timeBlocks;

      try {
        location = JSON.parse(req.body.location);
        coordinates = JSON.parse(req.body.coordinates);
        features = JSON.parse(req.body.features);
        extras = JSON.parse(req.body.extras || "[]");
        pricing = JSON.parse(req.body.pricing);
        bookingSettings = JSON.parse(req.body.bookingSettings || "{}");
        blockedDates = req.body.blockedDates
          ? JSON.parse(req.body.blockedDates)
          : [];
        timeBlocks = req.body.timeBlocks ? JSON.parse(req.body.timeBlocks) : [];
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        cleanupTempFiles([
          ...(req.files?.images || []),
          ...(req.files?.cqcDocuments || []),
          ...(req.files?.leaseFile || []), // ✅ NEW: Added lease file cleanup
        ]);
        return res.status(400).json({
          error: "Invalid JSON format in request body",
          details: parseError.message,
        });
      }

      const { title, description, category, subcategory } = req.body;
      let categoriesArray = [];
      let subcategoriesArray = [];
      try {
        categoriesArray = req.body.categories ? JSON.parse(req.body.categories) : [];
        subcategoriesArray = req.body.subcategories ? JSON.parse(req.body.subcategories) : [];
      } catch (e) {
        categoriesArray = [];
        subcategoriesArray = [];
      }
      const availability = req.body.availability || "all";
      const host = req.user.id;

      // ── Required fields check ──
      if (!title || !description) {
        cleanupTempFiles([
          ...(req.files?.images || []),
          ...(req.files?.cqcDocuments || []),
          ...(req.files?.leaseFile || []), // ✅ NEW: Added lease file cleanup
        ]);
        return res.status(400).json({
          error: "Missing required fields: title and description are required",
        });
      }

      // ── Category / Subcategory validation ──
      if (category?.trim()) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
          cleanupTempFiles([
            ...(req.files?.images || []),
            ...(req.files?.cqcDocuments || []),
            ...(req.files?.leaseFile || []), // ✅ NEW: Added lease file cleanup
          ]);
          return res.status(404).json({ error: "Category not found" });
        }
      }

      if (categoriesArray.length > 0) {
        const foundCategories = await Category.find({ _id: { $in: categoriesArray } });
        if (foundCategories.length !== categoriesArray.length) {
          cleanupTempFiles([
            ...(req.files?.images || []),
            ...(req.files?.cqcDocuments || []),
            ...(req.files?.leaseFile || []),
          ]);
          return res.status(400).json({ error: "One or more category IDs are invalid" });
        }
      }

      // ── User validation ──
      const user = await User.findById(req.user.id);
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }
      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: "You must verify your account before creating a property",
        });
      }

      // ── Required profile fields ──
      const requiredFields = [
        "lastName",
        "firstName",
        "phoneNumber",
        "address",
        "profileImage",
        "payoutMethods",
        "dob",
      ];
      /*
      const missingFields = requiredFields.filter(
        (field) => !user[field] || user[field].toString().trim() === ""
      );
      if (missingFields.length > 0) {
        const fieldLabels = {
          lastName: "Last name",
          firstName: "First name",
          phoneNumber: "Phone number",
          address: "Address",
          profileImage: "Profile image",
          payoutMethods: "Payout method",
          dob: "Date of birth",
        };
        const readableFields = missingFields.map(
          (field) => fieldLabels[field] || field
        );
        const message =
          readableFields.length === 1
            ? `Please provide your ${readableFields[0]} before creating a property`
            : `Please provide the following fields before creating a property: ${readableFields.join(
                ", "
              )}`;

        return res.status(403).json({
          success: false,
          message,
          missingFields,
        });
      }
      */

      // ── Handle image upload to R2 ──
      let r2ImageUrls = [];
      const imageFiles = req.files?.images || [];
      if (imageFiles.length > 0) {
        try {
          r2ImageUrls = await uploadFilesToR2(imageFiles);
        } catch (uploadError) {
          console.error("Error uploading to R2:", uploadError);
          return res.status(500).json({
            error: "Failed to upload images",
            details: uploadError.message,
          });
        }
      }

      // ── Handle CQC document upload ──
      let cqcDocumentUrls = [];
      const cqcFiles = req.files?.cqcDocuments || [];
      if (cqcFiles.length > 0) {
        try {
          cqcDocumentUrls = await uploadFilesToR2(cqcFiles);
        } catch (uploadError) {
          console.error("Error uploading CQC documents to R2:", uploadError);
          return res.status(500).json({
            error: "Failed to upload CQC documents",
            details: uploadError.message,
          });
        }
      }

      // ✅ NEW: Handle lease agreement upload
      let leaseAgreementUrl = null;
      const leaseFiles = req.files?.leaseFile || [];
      if (leaseFiles.length > 0) {
        try {
          const uploadedLeaseUrls = await uploadFilesToR2(leaseFiles);
          leaseAgreementUrl = uploadedLeaseUrls[0]; // Only one file expected
        } catch (uploadError) {
          console.error("Error uploading lease agreement to R2:", uploadError);
          return res.status(500).json({
            error: "Failed to upload lease agreement",
            details: uploadError.message,
          });
        }
      }

      // ── Handle draft images ──
      let draftImages = [];
      if (req.body.draftId) {
        const draft = await Draft.findById(req.body.draftId);
        draftImages = draft?.images || [];
      }
      const removedImages = req.body.removedImages
        ? JSON.parse(req.body.removedImages)
        : [];
      draftImages = draftImages.filter(
        (img) => !removedImages.includes(img.filename)
      );
      const allImages = [...draftImages.map((img) => img.url), ...r2ImageUrls];
      const coverImageIndex = parseInt(req.body.coverImageIndex) || 0;
      const coverImage =
        allImages.length > 0 ? allImages[coverImageIndex] || allImages[0] : null;

      // ── Validate custom availability ──
      if (
        availability === "custom" &&
        (!timeBlocks || timeBlocks.length === 0)
      ) {
        return res.status(400).json({
          message: "Time blocks are required for custom availability",
        });
      }

      // ── Save property ──
      const property = new Property({
        title,
        description,
        whatsIncluded: req.body.whatsIncluded || "",
        location,
        coordinates,
        images: allImages,
        coverImage,
        features: {
          ...features,
          houseRules: features.houseRules || "",
        },
        extras: extras || [],
        pricing,
        bookingSettings,
        host,
        category: category && category.trim() ? category : undefined,
        subcategory: typeof subcategory === "string" ? subcategory : "",
        categories: categoriesArray,
        subcategories: subcategoriesArray,
        availability,
        timeBlocks,
        blockedDates: blockedDates.map((d) => ({
          start: new Date(d.start),
          end: new Date(d.end),
          reason: d.reason || "personal",
        })),
        cqcDocuments: cqcDocumentUrls,
        leaseAgreement: leaseAgreementUrl, // ✅ NEW: Added lease agreement field
      });

      const savedProperty = await property.save();

      // Notify admins of new listing
      try {
        const sendEmail = require("../utils/sendEmail");
        const host = await User.findById(req.user.id).select("firstName lastName displayName email").lean();
        const hostName = host?.displayName || host?.firstName || "A host";
        const adminEmails = ["vencomeltd@gmail.com", "bashayr.alharthi@outlook.com"];
        sendEmail({
          to: adminEmails,
          subject: `New Listing Published - ${title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <img src=" https://vencome.com/VenCome.jpg " alt="VenCome" style="height:40px;margin-bottom:24px;" />
              <h2 style="color:#0A1628;">New Listing Created 🏢</h2>
              <p>A new commercial space has just been listed on VenCome.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px 0;color:#666;">Listing</td><td style="padding:8px 0;font-weight:700;">${title}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Host</td><td style="padding:8px 0;font-weight:700;">${hostName} (${host?.email || ""})</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Category</td><td style="padding:8px 0;font-weight:700;">${category || "Uncategorized"}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Location</td><td style="padding:8px 0;font-weight:700;">${location?.city || ""}, ${location?.country || ""}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;font-weight:700;">${new Date().toLocaleString("en-GB")}</td></tr>
              </table>
              <a href=" https://www.vencome.com/admin " style="display:inline-block;padding:12px 24px;background:#305CDE;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin-right:12px;">View in Admin</a>
              <a href=" https://www.vencome.com/property/${savedProperty._id} " style="display:inline-block;padding:12px 24px;background:#0A1628;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">View Listing</a>
            </div>
          `,
        }).catch((err) => console.error("Listing notification error:", err.message));
      } catch (notifyErr) {
        console.error("Failed to send listing notification:", notifyErr.message);
      }

      const propertyCount = await Property.countDocuments({
        host: req.user.id,
      });
      if (propertyCount === 1) {
        try {
          await makeUserHost(req.user.id);
        } catch (hostErr) {
          console.error("makeUserHost error:", hostErr);
        }
      }

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
              <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
                <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
              </div>
              <div style="padding: 30px; color: #333;">
                <h2 style="color: #305CDE; text-align: center; margin-top: 0;">Property Created Successfully 🎉</h2>
                <p>Hi <strong>${displayName}</strong>,</p>
                <p>Your property has been successfully created on <strong>VenCome</strong>. Here are the details:</p>
                <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Property name</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        property.title || "—"
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Location</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                        property.location.city || ""
                      }${
          property.location.country ? `, ${property.location.country}` : ""
        }</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; color: #666;">Created on</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: 600;">${new Date(
                        savedProperty.createdAt
                      ).toLocaleDateString()}</td>
                    </tr>
                  </table>
                </div>
                <p>You can now update availability, pricing, and amenities from your dashboard.</p>
                <p style="margin-bottom: 0;">If you didn't create this property, please contact our support team immediately.</p>
              </div>
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
      cleanupTempFiles([
        ...(req.files?.images || []),
        ...(req.files?.cqcDocuments || []),
        ...(req.files?.leaseFile || []), // ✅ NEW: Added lease file cleanup
      ]);
      res.status(500).json({ error: "Server error", details: err.message });
    }
  }
);

// ✅ Get all properties (paginated)
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const [properties, total] = await Promise.all([
      Property.find()
        .populate("host", "firstName lastName displayName email")
        .populate("category", "name")
        .populate("categories", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Property.countDocuments(),
    ]);

    res.json({
      success: true,
      count: properties.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      properties,
    });
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Search properties
router.get("/search", async (req, res) => {
  const {
    query: searchQuery,
    location,
    category,
    subcategory,
    minPrice,
    maxPrice,
    checkIn,
    checkOut,
    duration,
  } = req.query;

  const cacheKey = `search:${[
    searchQuery || "",
    location || "",
    category || "",
    minPrice || "",
    maxPrice || "",
    checkIn || "",
    checkOut || "",
    duration || "",
  ].join(":")}`;

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      return res.json({ success: true, ...JSON.parse(cached), cached: true });
    }

    let query = {};

    const searchTerm = searchQuery || location;

    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i");
      query.$or = [
        { title: regex },
        { description: regex },
      ];
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists)
        return res.status(400).json({ error: "Invalid category ID" });
      query.$or = [
        ...(query.$or || []),
        { category: category },
        { categories: category },
      ];
    }

    if (subcategory) {
      query.$and = [
        ...(query.$and || []),
        { $or: [{ subcategory: subcategory }, { subcategories: subcategory }] },
      ];
    }

    if (minPrice || maxPrice) {
      query["pricing.weekdayPrice"] = {};
      if (minPrice) query["pricing.weekdayPrice"].$gte = Number(minPrice);
      if (maxPrice) query["pricing.weekdayPrice"].$lte = Number(maxPrice);
    }

    // Duration filter — maps slug to a min/max day range
    // Assumes properties have a `minRentalDays` field (adjust to your schema)
    const DURATION_RANGES = {
      less_than_1_month: { max: 29 },
      "1_to_3_months": { min: 30, max: 90 },
      "3_to_12_months": { min: 91, max: 364 },
      "12_plus_months": { min: 365 },
    };

    if (duration && DURATION_RANGES[duration]) {
      const { min, max } = DURATION_RANGES[duration];
      query["minRentalDays"] = {};
      if (min !== undefined) query["minRentalDays"].$gte = min;
      if (max !== undefined) query["minRentalDays"].$lte = max;
    }

    // TODO: Implement proper availability filtering

    const properties = await Property.find(query)
      .populate("host", "firstName lastName displayName email")
      .populate("category", "name")
      .populate("categories", "name")
      .sort({ createdAt: -1 });

    const responsePayload = { count: properties.length, properties };

    await client.setEx(cacheKey, 600, JSON.stringify(responsePayload));

    res.json({ success: true, ...responsePayload, cached: false });
  } catch (err) {
    console.error("Error searching properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Get all saved properties for the logged-in user
router.get("/saved/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "savedProperties",
      populate: { path: "category", select: "name" },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      properties: user.savedProperties || [],
    });
  } catch (err) {
    console.error("Error fetching saved properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Get authenticated user's own listings (incl. unpublished)
router.get("/me", auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const [properties, total] = await Promise.all([
      Property.find({ host: req.user.id })
        .populate("category", "name")
        .populate("categories", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Property.countDocuments({ host: req.user.id }),
    ]);

    res.json({
      success: true,
      count: properties.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      properties,
    });
  } catch (err) {
    console.error("Error fetching user properties:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Host analytics — revenue, bookings, occupancy for the logged-in host
router.get("/analytics/me", auth, async (req, res) => {
  try {
    const Booking = require("../models/Booking");
    const hostId = req.user.id;

    const properties = await Property.find({ host: hostId }).select(
      "_id title coverImage"
    );
    const propertyIds = properties.map((p) => p._id);

    const bookings = await Booking.find({
      property: { $in: propertyIds },
    }).select("property totalPrice hostAmount status checkIn checkOut createdAt");

    const completedBookings = bookings.filter((b) =>
      ["confirmed", "completed"].includes(b.status)
    );

    const totalRevenue = completedBookings.reduce(
      (sum, b) => sum + (b.hostAmount || b.totalPrice * 0.9 || 0),
      0
    );
    const totalBookings = completedBookings.length;
    const pendingBookings = bookings.filter((b) => b.status === "pending").length;
    const cancelledBookings = bookings.filter((b) =>
      ["declined", "cancelled"].includes(b.status)
    ).length;
    const avgBookingValue = totalBookings > 0
      ? totalRevenue / totalBookings
      : 0;

    // Revenue per listing
    const listingStats = properties.map((property) => {
      const propertyBookings = completedBookings.filter(
        (b) => b.property.toString() === property._id.toString()
      );
      const revenue = propertyBookings.reduce(
        (sum, b) => sum + (b.hostAmount || b.totalPrice * 0.9 || 0),
        0
      );
      return {
        propertyId: property._id,
        title: property.title,
        coverImage: property.coverImage,
        bookings: propertyBookings.length,
        revenue,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Monthly trend — last 6 months
    const now = new Date();
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = monthDate.toLocaleDateString("en-GB", { month: "short" });
      const monthBookings = completedBookings.filter((b) => {
        const bDate = new Date(b.createdAt);
        return (
          bDate.getMonth() === monthDate.getMonth() &&
          bDate.getFullYear() === monthDate.getFullYear()
        );
      });
      const monthRevenue = monthBookings.reduce(
        (sum, b) => sum + (b.hostAmount || b.totalPrice * 0.9 || 0),
        0
      );
      monthlyData.push({
        month: monthLabel,
        bookings: monthBookings.length,
        revenue: Math.round(monthRevenue),
      });
    }

    res.json({
      success: true,
      totalRevenue: Math.round(totalRevenue),
      totalBookings,
      pendingBookings,
      cancelledBookings,
      avgBookingValue: Math.round(avgBookingValue),
      totalListings: properties.length,
      listingStats,
      monthlyData,
    });
  } catch (err) {
    console.error("Error fetching host analytics:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Get single property
router.get("/:id", async (req, res) => {
  const propertyId = req.params.id;

  try {
    const cached = await client.get(`property:${propertyId}`);
    if (cached) {
      return res.json({
        success: true,
        property: JSON.parse(cached),
        cached: true,
      });
    }

    const property = await Property.findById(propertyId)
      .populate("host", "firstName lastName displayName email")
      .populate("category", "name")
      .populate("categories", "name")
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "firstName lastName displayName profileImage",
        },
      });

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

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

// ✅ Get public availability for a property (blocked + booked dates)
router.get("/:id/availability", async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).select(
      "blockedDates availability bookingSettings"
    );

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // TODO: merge in confirmed bookings from your Booking model when ready
    // const bookings = await Booking.find({ property: req.params.id, status: "confirmed" })
    //   .select("checkIn checkOut");

    res.json({
      success: true,
      availability: property.availability,
      blockedDates: property.blockedDates,
      bookingSettings: property.bookingSettings,
      // bookedRanges: bookings.map(b => ({ start: b.checkIn, end: b.checkOut })),
    });
  } catch (err) {
    console.error("Error fetching availability:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Update a property (with R2 upload + cache bust)
router.put("/:id", auth, upload.array("images", 45), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      cleanupTempFiles([
        ...(req.files?.images || []),
        ...(req.files?.cqcDocuments || []),
      ]);
      return res.status(404).json({ error: "Property not found" });
    }

    if (property.host.toString() !== req.user.id) {
      cleanupTempFiles([
        ...(req.files?.images || []),
        ...(req.files?.cqcDocuments || []),
      ]);
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    // Parse JSON fields if provided
    const parseField = (key, label) => {
      if (!req.body[key]) return undefined;
      try {
        return JSON.parse(req.body[key]);
      } catch {
        throw Object.assign(new Error(`Invalid ${label} format`), {
          status: 400,
        });
      }
    };

    let location,
      coordinates,
      features,
      extras,
      pricing,
      bookingSettings,
      blockedDates,
      availability;
    try {
      location = parseField("location", "location");
      coordinates = parseField("coordinates", "coordinates");
      features = parseField("features", "features");
      extras = parseField("extras", "extras");
      pricing = parseField("pricing", "pricing");
      bookingSettings = parseField("bookingSettings", "bookingSettings");
      blockedDates = parseField("blockedDates", "blockedDates");
    } catch (e) {
      cleanupTempFiles([
        ...(req.files?.images || []),
        ...(req.files?.cqcDocuments || []),
      ]);
      return res.status(400).json({ error: e.message });
    }

    const { title, description, category } = req.body;

    if (req.body.availability) {
      try {
        availability =
          typeof req.body.availability === "string"
            ? JSON.parse(req.body.availability)
            : req.body.availability;
      } catch {
        availability = null;
      }
    }

    if (req.body.bookingSettings) {
      try {
        bookingSettings =
          typeof req.body.bookingSettings === "string"
            ? JSON.parse(req.body.bookingSettings)
            : req.body.bookingSettings;
      } catch {
        bookingSettings = null;
      }
    }

    if (req.body.features) {
      try {
        features =
          typeof req.body.features === "string"
            ? JSON.parse(req.body.features)
            : req.body.features;
      } catch {
        features = null;
      }
    }

    if (category && category.trim()) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        cleanupTempFiles([
          ...(req.files?.images || []),
          ...(req.files?.cqcDocuments || []),
        ]);
        return res.status(400).json({ error: "Invalid category ID" });
      }
    }

    if (req.files?.length > 0) {
      try {
        const newR2Urls = await uploadFilesToR2(req.files);
        property.images = [...property.images, ...newR2Urls];
        if (!property.coverImage) property.coverImage = newR2Urls[0];
      } catch (uploadError) {
        console.error("Error uploading to R2:", uploadError);
        return res.status(500).json({
          error: "Failed to upload images",
          details: uploadError.message,
        });
      }
    }

    if (title) property.title = title;
    if (description) property.description = description;
    if (req.body.whatsIncluded !== undefined) {
      property.whatsIncluded = req.body.whatsIncluded;
    }
    if (location) property.location = location;
    if (coordinates) property.coordinates = coordinates;
    if (features) {
      const existingFeatures = property.features?.toObject
        ? property.features.toObject()
        : property.features || {};
      property.features = {
        ...existingFeatures,
        capacity: features.capacity ?? existingFeatures.capacity ?? 0,
        amenities: features.amenities ?? existingFeatures.amenities ?? [],
        houseRules: features.houseRules ?? existingFeatures.houseRules ?? "",
      };
      property.markModified("features");
    }
    if (extras) property.extras = extras;
    if (pricing) property.pricing = pricing;
    if (bookingSettings) property.bookingSettings = bookingSettings;
    if (category) property.category = category;
    // FIX: availability and blockedDates were missing from PUT
    if (availability) property.availability = availability;
    if (blockedDates) {
      property.blockedDates = blockedDates.map((d) => ({
        start: new Date(d.start),
        end: new Date(d.end),
        reason: d.reason || "blocked",
      }));
    }

    const updatedProperty = await property.save();

    // FIX: bust the cache after a successful update
    await client.del(`property:${req.params.id}`);

    res.json({
      success: true,
      message: "Property updated successfully",
      property: updatedProperty,
    });
  } catch (err) {
    console.error("Error updating property:", err);
    cleanupTempFiles([
      ...(req.files?.images || []),
      ...(req.files?.cqcDocuments || []),
    ]);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Publish / unpublish a property
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: "Property not found" });

    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    property.isActive = isActive;
    await property.save();

    // Bust cache so listing visibility updates immediately
    await client.del(`property:${req.params.id}`);

    res.json({
      success: true,
      message: `Property ${
        isActive ? "published" : "unpublished"
      } successfully`,
      isActive: property.isActive,
    });
  } catch (err) {
    console.error("Error updating property status:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Update blocked dates only (lightweight alternative to full PUT)
router.patch("/:id/availability", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: "Property not found" });

    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    const { blockedDates, availability } = req.body;

    if (blockedDates !== undefined) {
      if (!Array.isArray(blockedDates)) {
        return res.status(400).json({ error: "blockedDates must be an array" });
      }
      property.blockedDates = blockedDates.map((d) => ({
        start: new Date(d.start),
        end: new Date(d.end),
        reason: d.reason || "blocked",
      }));
    }

    if (availability !== undefined) {
      property.availability = availability;
    }

    await property.save();
    await client.del(`property:${req.params.id}`);

    res.json({
      success: true,
      message: "Availability updated successfully",
      blockedDates: property.blockedDates,
      availability: property.availability,
    });
  } catch (err) {
    console.error("Error updating availability:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Duplicate a listing
router.post("/:id/duplicate", auth, async (req, res) => {
  try {
    const original = await Property.findById(req.params.id);
    if (!original) return res.status(404).json({ error: "Property not found" });

    if (original.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    const duplicateData = original.toObject();
    delete duplicateData._id;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    delete duplicateData.reviews;
    duplicateData.title = `${original.title} (Copy)`;
    duplicateData.isActive = false; // start unpublished so host can review before going live

    const duplicate = new Property(duplicateData);
    const saved = await duplicate.save();

    res.status(201).json({
      success: true,
      message: "Property duplicated successfully",
      property: saved,
    });
  } catch (err) {
    console.error("Error duplicating property:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Report a listing
router.post("/:id/report", auth, async (req, res) => {
  try {
    const { reason, description } = req.body;

    if (!reason) {
      return res
        .status(400)
        .json({ error: "A reason is required to submit a report" });
    }

    const property = await Property.findById(req.params.id).select(
      "_id title host"
    );
    if (!property) return res.status(404).json({ error: "Property not found" });

    if (property.host.toString() === req.user.id) {
      return res
        .status(400)
        .json({ error: "You cannot report your own property" });
    }

    // TODO: persist to a Report model when you create one
    // await Report.create({ property: property._id, reportedBy: req.user.id, reason, description });

    // Notify admins by email in the meantime
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Property reported: ${property.title}`,
      html: `
        <p><strong>Property:</strong> ${property._id} — ${property.title}</p>
        <p><strong>Reported by:</strong> ${req.user.id}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Details:</strong> ${description || "None provided"}</p>
      `,
    });

    res
      .status(201)
      .json({ success: true, message: "Report submitted successfully" });
  } catch (err) {
    console.error("Error submitting report:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid property ID format" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Delete a property (with R2 cleanup + cache bust)
router.delete("/:id", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: "Property not found" });

    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    if (property.images?.length > 0) {
      try {
        await deleteFilesFromR2(property.images);
      } catch (deleteError) {
        console.error("Error deleting images from R2:", deleteError);
      }
    }

    await property.deleteOne();

    // FIX: bust cache before responding, and send email fire-and-forget
    await client.del(`property:${req.params.id}`);

    // FIX: send email before res.send() so a throw here doesn't crash silently
    const user = await User.findById(req.user.id);
    const displayName = user?.displayName || user?.firstName || "there";
    sendEmail({
      to: user.email,
      subject: "Your property has been deleted",
      html: `
        <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
              <img src="https://vencome.netlify.app/logo-blue.png" alt="VenCome" style="max-width: 150px;">
            </div>
            <div style="padding: 30px; color: #333;">
              <h2 style="color: #305CDE; text-align: center; margin-top: 0;">Property Deleted</h2>
              <p>Hi <strong>${displayName}</strong>,</p>
              <p>This is to confirm that the following property has been successfully deleted from your VenCome account:</p>
              <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Property name</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                      property.title || "—"
                    }</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Location</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600;">${
                      property.location.city || ""
                    }${
        property.location.country ? `, ${property.location.country}` : ""
      }</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Deleted on</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600;">${new Date().toLocaleDateString()}</td>
                  </tr>
                </table>
              </div>
              <p>Once a property is deleted, it is no longer visible or bookable on VenCome.</p>
              <p style="margin-bottom: 0;">You can create a new property at any time from your dashboard.</p>
            </div>
            <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
              This is an automated message, please do not reply.<br />
              © ${new Date().getFullYear()} VenCome. All rights reserved.
            </div>
          </div>
        </div>
      `,
    });

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting property:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Delete specific images from a property
router.delete("/:id/images", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: "Property not found" });

    if (property.host.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Unauthorized: You are not the host of this property",
      });
    }

    const { imageUrls } = req.body;
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        error: "Please provide an array of image URLs to delete",
      });
    }

    try {
      await deleteFilesFromR2(imageUrls);
    } catch (deleteError) {
      console.error("Error deleting from R2:", deleteError);
      return res
        .status(500)
        .json({ error: "Failed to delete images from storage" });
    }

    property.images = property.images.filter((img) => !imageUrls.includes(img));
    if (imageUrls.includes(property.coverImage)) {
      property.coverImage =
        property.images.length > 0 ? property.images[0] : null;
    }

    await property.save();

    // Bust cache after image deletion
    await client.del(`property:${req.params.id}`);

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

// ✅ Toggle save/unsave a property
router.post("/:id/save", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ error: "Property not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const alreadySaved = user.savedProperties?.some(
      (id) => id.toString() === req.params.id
    );

    if (alreadySaved) {
      user.savedProperties = user.savedProperties.filter(
        (id) => id.toString() !== req.params.id
      );
    } else {
      user.savedProperties = [...(user.savedProperties || []), req.params.id];
    }

    await user.save();

    res.json({
      success: true,
      saved: !alreadySaved,
      savedProperties: user.savedProperties,
    });
  } catch (err) {
    console.error("Error toggling saved property:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ✅ Check if a specific property is saved by the logged-in user
router.get("/:id/is-saved", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("savedProperties");
    if (!user) return res.status(404).json({ error: "User not found" });

    const isSaved = user.savedProperties?.some(
      (id) => id.toString() === req.params.id
    );

    res.json({ success: true, isSaved: !!isSaved });
  } catch (err) {
    console.error("Error checking saved status:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
