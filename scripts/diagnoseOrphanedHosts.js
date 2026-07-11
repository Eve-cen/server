// READ-ONLY diagnostic — does not modify any data.
// Finds properties whose `host` field is missing or points to a deleted user.
require("dotenv").config({ path: "config.env" });
const mongoose = require("mongoose");
const Property = require("../models/Property");
const User = require("../models/User");
const Booking = require("../models/Booking");

const run = async () => {
  await mongoose.connect(process.env.DATABASE);
  console.log("Connected (read-only)");

  const totalProperties = await Property.countDocuments({});
  const noHostField = await Property.find({ $or: [{ host: null }, { host: { $exists: false } }] }).select(
    "_id title createdAt isActive"
  );

  const withHostField = await Property.find({ host: { $ne: null, $exists: true } }).select(
    "_id title createdAt isActive host"
  );

  const orphanedRef = [];
  for (const p of withHostField) {
    const user = await User.findById(p.host).select("_id");
    if (!user) orphanedRef.push(p);
  }

  const allOrphans = [...noHostField, ...orphanedRef];

  console.log(`\nTotal properties: ${totalProperties}`);
  console.log(`Missing host field entirely: ${noHostField.length}`);
  console.log(`Host field set but user deleted: ${orphanedRef.length}`);
  console.log(`Total orphaned: ${allOrphans.length}\n`);

  for (const p of allOrphans) {
    const bookingCount = await Booking.countDocuments({ property: p._id });
    console.log(
      `- ${p._id} | "${p.title}" | active=${p.isActive} | created=${p.createdAt?.toISOString().slice(0, 10)} | bookings=${bookingCount} | hostField=${p.host || "none"}`
    );
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Diagnostic failed:", err.message);
  process.exit(1);
});
