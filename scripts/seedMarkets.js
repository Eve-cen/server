// One-time seed to migrate the old hardcoded Markets tab content into real,
// editable Market documents. Safe to re-run — skips markets that already exist.
require("dotenv").config({ path: "config.env" });
const mongoose = require("mongoose");
const Market = require("../models/Market");

// Only UK is live for now (MVP launch market). Add Saudi Arabia / UAE / Qatar
// here when those markets are ready to go live -- don't seed them ahead of time.
const DEFAULT_MARKETS = [
  { name: "United Kingdom", flag: "🇬🇧", cities: ["London", "Manchester", "Birmingham", "Edinburgh"], status: "active", phase: "Phase 1", order: 0 },
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
