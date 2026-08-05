const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const uploadToR2 = require("../utils/uploadService");

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
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Images (for draft photos) plus PDF/DOC/DOCX (for draft lease agreements)
    // — same set of types the final property-creation upload already accepts.
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!file.mimetype.startsWith("image/") && !allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only image, PDF, DOC, and DOCX files are allowed!"), false);
    }
    cb(null, true);
  },
});

// POST /upload
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    // Upload to R2
    const result = await uploadToR2(req.file.path, req.file.filename, req.file.mimetype);

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      url: result.location,
      filename: result.key,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Clean up local file if it still exists
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("Error deleting local file:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: "Error uploading file",
      message: error.message,
    });
  }
});

module.exports = router;
