const express = require("express");
const fs = require("fs");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const Review = require("../models/Review");
const auth = require("../middleware/auth");
const multer = require("multer");
const uploadToR2 = require("../utils/uploadService");
const { deleteFromR2 } = require("../utils/uploadService");
const router = express.Router();

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
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
});

// Update profile (PUT /api/profile)
router.put("/", auth, upload.single("profileImage"), async (req, res) => {
  try {
    const { displayName, bio } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    let profileImageUrl = user.profileImage;

    // Upload new image if provided
    if (req.file) {
      try {
        const result = await uploadToR2(req.file.path, req.file.filename);
        profileImageUrl = result.location;

        // delete old avatar from R2
        if (user.profileImage) {
          const oldFile = user.profileImage.split("/").pop();
          await deleteFromR2(oldFile);
        }

        // remove temp file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error(uploadError);

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
          error: "Image upload failed",
        });
      }
    }

    user.profileImage = profileImageUrl;
    user.displayName = displayName || user.displayName;
    user.bio = bio || user.bio;

    const updatedUser = await user.save();

    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Export own data (GET /api/profile/export-data)
router.get("/export-data", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, bookingsAsGuest, bookingsAsHost, properties, reviewsGiven, reviewsReceived] =
      await Promise.all([
        User.findById(userId).select("-password").lean(),
        Booking.find({ guest: userId }).lean(),
        Booking.find({ host: userId }).lean(),
        Property.find({ host: userId }).lean(),
        Review.find({ guest: userId }).lean(),
        Review.find({ host: userId }).lean(),
      ]);

    if (!user) return res.status(404).json({ error: "User not found" });

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: user,
      bookingsAsGuest,
      bookingsAsHost,
      properties,
      reviewsGiven,
      reviewsReceived,
    };

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vencome-data-export-${userId}.json"`
    );
    res.setHeader("Content-Type", "application/json");
    res.json(exportData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// The old self-service "grant support access" toggle has been replaced by
// an admin-initiated request/grant flow — see routes/admin.js
// POST /users/:id/support-access/request and routes/supportAccess.js for
// the user-facing grant/deny screen the request email links to.

router.get("/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password"); // exclude sensitive fields

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid user id" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
