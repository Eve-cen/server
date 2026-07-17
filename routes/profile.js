const express = require("express");
const User = require("../models/User");
const SupportAccessLog = require("../models/SupportAccessLog");
const auth = require("../middleware/auth");
const multer = require("multer");
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

// ─── Consent-based support access ─────────────────────────────────────────────
// POST /api/profile/support-access/grant — user grants a 24h window during
// which admin/support staff may log in as them (see routes/admin.js
// /users/:id/impersonate). Does not grant standing access; auto-expires.
router.post("/support-access/grant", auth, async (req, res) => {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { supportAccess: { granted: true, grantedAt: new Date(), expiresAt } },
      { new: true }
    ).select("supportAccess");
    await SupportAccessLog.create({ user: req.user.id, action: "granted" });
    res.json({ supportAccess: user.supportAccess });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/profile/support-access/revoke — user revokes access immediately,
// even if the 24h window hasn't elapsed yet.
router.post("/support-access/revoke", auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { "supportAccess.granted": false },
      { new: true }
    ).select("supportAccess");
    await SupportAccessLog.create({ user: req.user.id, action: "revoked" });
    res.json({ supportAccess: user.supportAccess });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

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
