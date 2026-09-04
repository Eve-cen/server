// One-off data fix: a host with a Spanish-locale device saw the Google
// Places Autocomplete return "Reino Unido" instead of "United Kingdom" for
// listings created before the language=en fix was added to the Maps script
// URLs (client-side). This corrects any Property already saved with that
// value. Run with --apply to actually write; without it, dry-run only.
require("dotenv").config({ path: "config.env" });
const mongoose = require("mongoose");
const Property = require("../models/Property");

const APPLY = process.argv.includes("--apply");

const run = async () => {
  await mongoose.connect(process.env.DATABASE);
  console.log(`Connected (${APPLY ? "APPLY" : "dry-run"})`);

  const affected = await Property.find({ "location.country": "Reino Unido" }).select(
    "_id title location.country"
  );

  console.log(`Found ${affected.length} propert${affected.length === 1 ? "y" : "ies"} with location.country = "Reino Unido":`);
  affected.forEach((p) => console.log(`  ${p._id}  ${p.title}`));

  if (APPLY && affected.length > 0) {
    const result = await Property.updateMany(
      { "location.country": "Reino Unido" },
      { $set: { "location.country": "United Kingdom" } }
    );
    console.log(`Updated ${result.modifiedCount} document(s).`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
