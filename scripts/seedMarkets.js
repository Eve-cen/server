// One-time seed to migrate the old hardcoded Markets tab content into real,
// editable Market documents. Safe to re-run — skips markets that already exist.
require("dotenv").config({ path: "config.env" });
const mongoose = require("mongoose");
const Market = require("../models/Market");

const DEFAULT_MARKETS = [
  { name: "United Kingdom", flag: "🇬🇧", cities: ["London", "Manchester", "Birmingham", "Edinburgh"], status: "active", phase: "Phase 1", order: 0 },
  { name: "Saudi Arabia", flag: "🇸🇦", cities: ["Riyadh", "Jeddah", "Dammam"], status: "active", phase: "Phase 2", order: 1 },
  { name: "UAE", flag: "🇦🇪", cities: ["Dubai", "Abu Dhabi"], status: "coming_soon", phase: "Phase 3", order: 2 },
  { name: "Qatar", flag: "🇶🇦", cities: ["Doha"], status: "planned", phase: "Phase 4", order: 3 },
];

const run = async () => {
  await mongoose.connect(process.env.DATABASE);
  console.log("Connected");

  for (const market of DEFAULT_MARKETS) {
    const existing = await Market.findOne({ name: market.name });
    if (existing) {
      console.log(`Skipping "${market.name}" — already exists`);
      continue;
    }
    await Market.create(market);
    console.log(`Created "${market.name}"`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
