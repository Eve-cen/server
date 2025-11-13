const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    image: {
      type: String,
      default:
        "https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
