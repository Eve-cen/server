const mongoose = require("mongoose");
require("dotenv").config({ path: "./config.env" });

const categorySchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    image: String,
    subcategories: [
      {
        name: String,
        description: String,
        image: String,
      },
    ],
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);

mongoose
  .connect(process.env.DATABASE)
  .then(async () => {
    console.log("Connected to:", mongoose.connection.db.databaseName);

    const categories = [
      {
        name: "Office Space",
        description: "Private suites, executive offices, and corporate floors.",
        image:
          "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400&q=80",
        subcategories: [
          {
            name: "Private Office",
            description: "Fully private office space",
            image: "",
          },
          {
            name: "Executive Suite",
            description: "Premium executive offices",
            image: "",
          },
          {
            name: "Serviced Office",
            description: "Fully serviced office space",
            image: "",
          },
          {
            name: "Virtual Office",
            description: "Virtual office address",
            image: "",
          },
        ],
      },
      {
        name: "Co-working & Flex Space",
        description: "Flex desks, day passes, and shared work environments.",
        image:
          "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80",
        subcategories: [
          { name: "Hot Desk", description: "Flexible hot desking", image: "" },
          {
            name: "Dedicated Desk",
            description: "Your own permanent desk",
            image: "",
          },
          { name: "Team Pod", description: "Private area for teams", image: "" },
        ],
      },
      {
        name: "Meeting & Conference Rooms",
        description: "Boardrooms, training rooms, and conference spaces.",
        image:
          "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=400&q=80",
        subcategories: [
          { name: "Boardroom", description: "Professional boardroom", image: "" },
          {
            name: "Training Room",
            description: "Equipped training space",
            image: "",
          },
          {
            name: "Interview Room",
            description: "Private interview space",
            image: "",
          },
          {
            name: "Video Conference Suite",
            description: "AV-equipped suite",
            image: "",
          },
        ],
      },
      {
        name: "Event Venues",
        description:
          "Corporate event halls, rooftop terraces, and exhibition spaces.",
        image:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=400&q=80",
        subcategories: [
          {
            name: "Corporate Event Hall",
            description: "Large event space",
            image: "",
          },
          {
            name: "Rooftop Terrace",
            description: "Outdoor rooftop venue",
            image: "",
          },
          {
            name: "Exhibition Hall",
            description: "Exhibition and trade space",
            image: "",
          },
        ],
      },
      {
        name: "Retail & Showroom",
        description: "Pop-up retail units, showrooms, and market stalls.",
        image:
          "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80",
        subcategories: [
          {
            name: "Pop-up Retail",
            description: "Temporary retail unit",
            image: "",
          },
          { name: "Showroom", description: "Product display space", image: "" },
          { name: "Market Stall", description: "Indoor market stall", image: "" },
        ],
      },
      {
        name: "Industrial & Warehouse",
        description: "Warehouses, storage units, and fulfilment centres.",
        image:
          "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&q=80",
        subcategories: [
          { name: "Warehouse", description: "Large warehouse space", image: "" },
          { name: "Storage Unit", description: "Secure storage", image: "" },
          {
            name: "Fulfilment Centre",
            description: "Logistics and fulfilment",
            image: "",
          },
        ],
      },
      {
        name: "Studio Space",
        description:
          "Photography studios, film sets, music studios, and art studios.",
        image:
          "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&q=80",
        subcategories: [
          {
            name: "Photography Studio",
            description: "Professional photo studio",
            image: "",
          },
          { name: "Film Set", description: "Film and video production", image: "" },
          { name: "Music Studio", description: "Recording studio", image: "" },
          { name: "Art Studio", description: "Creative art space", image: "" },
        ],
      },
      {
        name: "Hospitality & Leisure",
        description:
          "Private dining rooms, sports facilities, and wellness studios.",
        image:
          "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80",
        subcategories: [
          {
            name: "Private Dining Room",
            description: "Exclusive dining space",
            image: "",
          },
          {
            name: "Sports Facility",
            description: "Sports and fitness space",
            image: "",
          },
          {
            name: "Wellness Studio",
            description: "Health and wellness space",
            image: "",
          },
        ],
      },
      {
        name: "Medical & Clinical",
        description: "Consulting rooms, therapy rooms, and clinical suites.",
        image:
          "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=400&q=80",
        subcategories: [
          {
            name: "Consulting Room",
            description: "Private consulting space",
            image: "",
          },
          {
            name: "Therapy Room",
            description: "Therapy and treatment room",
            image: "",
          },
          {
            name: "Clinical Suite",
            description: "Full clinical facilities",
            image: "",
          },
        ],
      },
      {
        name: "Educational & Training",
        description: "Classrooms, lecture theatres, and seminar rooms.",
        image:
          "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&q=80",
        subcategories: [
          {
            name: "Classroom",
            description: "Traditional classroom setup",
            image: "",
          },
          {
            name: "Lecture Theatre",
            description: "Large lecture space",
            image: "",
          },
          {
            name: "Seminar Room",
            description: "Small group seminar space",
            image: "",
          },
        ],
      },
      {
        name: "Other / Custom",
        description: "Any commercial space not fitting a standard category.",
        image:
          "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80",
        subcategories: [],
      },
    ];

    const existingNames = (await Category.find({}, "name")).map((c) => c.name);
    const newCategories = categories.filter((c) => !existingNames.includes(c.name));
    console.log(
      `Found ${existingNames.length} existing categories, adding ${newCategories.length} new ones`
    );

    if (newCategories.length === 0) {
      console.log("No new categories to add");
      await mongoose.disconnect();
      process.exit(0);
    }

    const inserted = await Category.insertMany(newCategories);

    console.log(`${inserted.length} categories seeded successfully`);
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
