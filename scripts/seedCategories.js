const mongoose = require("mongoose");
const Category = require("../models/Category"); // adjust path if needed

mongoose
  .connect(
    "mongodb+srv://vencomeltd_db_user:DevDan12345@vencome.6yfcha8.mongodb.net/?appName=Vencome"
  )
  .then(async () => {
    const result = await Category.findByIdAndUpdate(
      "6915bd724f4f95223e555e57",
      {
        $set: {
          subcategory: [
            { name: "Osteopathy" },
            { name: "Physiotherapy" },
            { name: "Sports Therapy" },
            { name: "Hands on Care" },
            { name: "Aesthetics" },
          ],
        },
      },
      { new: true }
    );
    console.log("Updated:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
