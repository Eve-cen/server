const mongoose = require("mongoose");

// One review per user, prompted right after their first booking — how they
// found VenCome as a platform, separate from listing/host reviews.
const platformReviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PlatformReview", platformReviewSchema);
