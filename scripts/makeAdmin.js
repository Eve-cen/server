require("dotenv").config({ path: require("path").join(__dirname, "../config.env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/makeAdmin.js <email>");
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.DATABASE);

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  user.isAdmin = true;
  await user.save();

  console.log(`✅ ${user.email} is now an admin.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
