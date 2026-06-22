require("dotenv").config({ path: require("path").join(__dirname, "../config.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const email = "vencomeltd@gmail.com";
const plainPassword = "Vc#Adm9n!2026Kx";

async function run() {
  await mongoose.connect(process.env.DATABASE);

  let user = await User.findOne({ email });
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  if (user) {
    user.password = hashedPassword;
    user.isAdmin = true;
    await user.save();
    console.log(`✅ Existing user ${email} updated: password set, isAdmin = true`);
  } else {
    user = await User.create({
      email,
      password: hashedPassword,
      isAdmin: true,
      isVerified: true,
      firstName: "VenCome",
      lastName: "Admin",
    });
    console.log(`✅ New super admin created: ${email}`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
