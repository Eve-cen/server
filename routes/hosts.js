const express = require("express");
const User = require("../models/User");
const Property = require("../models/Property");
const router = express.Router();

router.get("/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;

    // Fetch host (public fields only)
    const host = await User.findById(hostId).select(
      "name profileImage bio createdAt"
    );
    if (!host) return res.status(404).json({ error: "Host not found" });

    // Count total listings
    const totalListings = await Property.countDocuments({ host: hostId });

    // Calculate average rating
    const properties = await Property.find({ host: hostId }).select("reviews");
    let totalRating = 0;
    let totalReviews = 0;

    properties.forEach((prop) => {
      if (Array.isArray(prop.reviews)) {
        prop.reviews.forEach((review) => {
          totalRating += review.rating;
          totalReviews++;
        });
      }
    });

    const avgRating =
      totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : null;

    res.json({
      ...host.toObject(),
      totalListings,
      avgRating,
      totalReviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
