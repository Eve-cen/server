const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const propertyRoutes = require("./routes/properties");
const categoryRoutes = require("./routes/categories");
const bookingRoutes = require("./routes/bookings");
const settingsRoutes = require("./routes/settings");
const profileRoutes = require("./routes/profile");
const uploadRoutes = require("./routes/upload");

dotenv.config({ path: "./config.env" });

const app = express();

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true, // important for cookies or Authorization headers
  })
);
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.DATABASE)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/profile", profileRoutes); // New
app.use("/api/upload", uploadRoutes);
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
