const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");
const fs = require("fs");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Choose storage type based on environment
const useCloudinary = process.env.USE_CLOUDINARY === "true";

let storage;

if (useCloudinary) {
  // Cloudinary Storage (Production)
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: "properties",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { width: 1200, height: 800, crop: "limit", quality: "auto" },
      ],
    },
  });
} else {
  // Local Storage (Development)
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = "uploads/properties";
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });
}

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("Only image files (JPEG, JPG, PNG, WEBP) are allowed"));
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
  },
});

// Helper function to delete image from Cloudinary
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!useCloudinary) return;

    // Extract public_id from Cloudinary URL
    const parts = imageUrl.split("/");
    const filename = parts[parts.length - 1];
    const publicId = `properties/${filename.split(".")[0]}`;

    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
  }
};

// Helper function to delete local file
const deleteLocalFile = (filePath) => {
  try {
    if (useCloudinary) return;

    const fullPath = path.join(__dirname, "..", filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.error("Error deleting local file:", error);
  }
};

module.exports = {
  upload,
  deleteFromCloudinary,
  deleteLocalFile,
  useCloudinary,
};
