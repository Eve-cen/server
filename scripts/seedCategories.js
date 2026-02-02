const mongoose = require("mongoose");
const Category = require("../models/Category");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

mongoose.connect(process.env.DATABASE);

async function seed() {
  await Category.create({
    name: "Fitness space",
    description:
      "Spaces designed for fitness, training, and group exercise activities.",
    image:
      "https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=800",
    subcategory: [
      {
        name: "Reformer pilates rooms",
        description: "Studios equipped with reformer pilates machines",
      },
      {
        name: "Yoga",
        description: "Quiet spaces suitable for yoga and stretching sessions",
      },
      {
        name: "Zumba",
        description: "Open spaces for dance-based fitness classes",
      },
      {
        name: "Kickboxing",
        description: "Training areas for kickboxing and combat fitness",
      },
    ],
  });

  console.log("Categories seeded");
  process.exit();
}

seed();
