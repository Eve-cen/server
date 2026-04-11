const mongoose = require("mongoose");
const Category = require("../models/Category");

const MONGO_URI =
  "mongodb+srv://vencomeltd_db_user:DevDan12345@vencome.6yfcha8.mongodb.net/?appName=Vencome";

const imageMap = {
  // Health & Therapy
  Osteopathy:
    "https://images.pexels.com/photos/5449112/pexels-photo-5449112.jpeg",
  Physiotherapy:
    "https://images.pexels.com/photos/4506109/pexels-photo-4506109.jpeg",
  "Sports Therapy":
    "https://images.pexels.com/photos/4506110/pexels-photo-4506110.jpeg",
  "Hands on Care":
    "https://images.pexels.com/photos/3959485/pexels-photo-3959485.jpeg",
  Aesthetics:
    "https://images.pexels.com/photos/3985338/pexels-photo-3985338.jpeg",

  // Events & Celebrations
  Birthdays:
    "https://images.pexels.com/photos/1543762/pexels-photo-1543762.jpeg",
  "Social Event Spaces":
    "https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg",
  "Corporate Event Rooms":
    "https://images.pexels.com/photos/2182973/pexels-photo-2182973.jpeg",
  "Wedding & Banquet Halls":
    "https://images.pexels.com/photos/2608517/pexels-photo-2608517.jpeg",
  "Creative & Cultural Spaces":
    "https://images.pexels.com/photos/236748/pexels-photo-236748.jpeg",
  "Wellness & Lifestyle Event Spaces":
    "https://images.pexels.com/photos/1051838/pexels-photo-1051838.jpeg",
  "Dining & Hospitality Event Rooms":
    "https://images.pexels.com/photos/1036857/pexels-photo-1036857.jpeg",
  "Entertainment & Party Venues":
    "https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg",
  "Hybrid / Multi-Purpose Spaces":
    "https://images.pexels.com/photos/260689/pexels-photo-260689.jpeg",

  // Fitness & Studio
  "Reformer pilates rooms":
    "https://images.pexels.com/photos/4662363/pexels-photo-4662363.jpeg",
  Yoga: "https://images.pexels.com/photos/3822621/pexels-photo-3822621.jpeg",
  Zumba: "https://images.pexels.com/photos/868483/pexels-photo-868483.jpeg",
  Kickboxing:
    "https://images.pexels.com/photos/4761713/pexels-photo-4761713.jpeg",
};

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to DB");

    const categories = await Category.find({});
    let totalUpdated = 0;

    for (const category of categories) {
      let categoryModified = false;

      category.subcategories.forEach((sub) => {
        const mappedImage = imageMap[sub.name];

        if (mappedImage) {
          sub.image = mappedImage;
          categoryModified = true;
          console.log(`  Updating: [${category.name} -> ${sub.name}]`);
        } else {
          console.warn(`  ⚠️ No image found in map for: "${sub.name}"`);
        }
      });

      if (categoryModified) {
        await category.save();
        totalUpdated++;
      }
    }

    console.log(
      `\n🎉 Done. ${totalUpdated} categories saved with new subcategory images.`
    );
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
};

run();
