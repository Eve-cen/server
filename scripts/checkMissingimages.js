const mongoose = require("mongoose");
const Category = require("../models/Category");

const run = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://vencomeltd_db_user:DevDan12345@vencome.6yfcha8.mongodb.net/?appName=Vencome"
    );
    console.log("✅ Connected");

    const categories = await Category.find({});

    const missing = [];

    for (const cat of categories) {
      for (const sub of cat.subcategories || []) {
        if (!sub.image) {
          missing.push({
            category: cat.name,
            subcategory: sub.name,
          });
        }
      }
    }

    console.log("❌ Missing images:");
    console.log(missing);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
