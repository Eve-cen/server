const express = require("express");
const router = express.Router();
const Draft = require("../models/Draft");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for draft images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const draftDir = "uploads/drafts";
    if (!fs.existsSync(draftDir)) {
      fs.mkdirSync(draftDir, { recursive: true });
    }
    cb(null, draftDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "draft-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
});

// @route   POST /api/drafts/save
// @desc    Save or update draft
// @access  Private
router.post("/save", auth, upload.array("images", 10), async (req, res) => {
  try {
    const userId = req.user.id;
    const draftData = JSON.parse(req.body.data);

    // Handle uploaded images
    const newImages = req.files
      ? req.files.map((file) => ({
          url: `/uploads/drafts/${file.filename}`,
          filename: file.filename,
        }))
      : [];

    // Get existing draft to preserve images
    let existingDraft = await Draft.findOne({ user: userId });
    let existingImages = existingDraft?.images || [];

    // Parse removedImages if provided
    const removedImages = req.body.removedImages
      ? JSON.parse(req.body.removedImages)
      : [];

    // Remove deleted images from filesystem
    if (removedImages.length > 0) {
      removedImages.forEach((filename) => {
        const filePath = path.join(
          __dirname,
          "..",
          "uploads",
          "drafts",
          filename
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      // Filter out removed images
      existingImages = existingImages.filter(
        (img) => !removedImages.includes(img.filename)
      );
    }

    // Combine existing and new images
    const allImages = [...existingImages, ...newImages];

    // Update or create draft
    const draft = await Draft.findOneAndUpdate(
      { user: userId },
      {
        ...draftData,
        images: allImages,
        user: userId,
        lastSaved: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: "Draft saved successfully",
      draft,
    });
  } catch (error) {
    console.error("Save draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save draft",
      error: error.message,
    });
  }
});

// @route   GET /api/drafts
// @desc    Get user's draft
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const draft = await Draft.findOne({ user: userId }).populate("category");

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "No draft found",
      });
    }

    res.json({
      success: true,
      draft,
    });
  } catch (error) {
    console.error("Get draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve draft",
      error: error.message,
    });
  }
});

// @route   DELETE /api/drafts
// @desc    Delete draft and its images
// @access  Private
router.delete("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const draft = await Draft.findOne({ user: userId });

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "No draft found",
      });
    }

    // Delete all draft images from filesystem
    if (draft.images && draft.images.length > 0) {
      draft.images.forEach((img) => {
        const filePath = path.join(
          __dirname,
          "..",
          "uploads",
          "drafts",
          img.filename
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    await Draft.deleteOne({ user: userId });

    res.json({
      success: true,
      message: "Draft deleted successfully",
    });
  } catch (error) {
    console.error("Delete draft error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete draft",
      error: error.message,
    });
  }
});

module.exports = router;
