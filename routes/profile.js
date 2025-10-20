const express = require("express");
const User = require("../models/User");
const auth = require("../middleware/auth");
const router = express.Router();

// Update profile (PUT /api/profile)
router.put("/", auth, async (req, res) => {
  const { profileImage, displayName, bio } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.profileImage = profileImage || user.profileImage;
    user.displayName = displayName || user.displayName;
    user.bio = bio || user.bio;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
