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
const messageRoutes = require("./routes/messages");
const hostRoutes = require("./routes/hosts");
const paymentRoutes = require("./routes/payments");
const geocodeRoutes = require("./routes/geocode");
const verificationRoutes = require("./routes/verification");
const http = require("http");
const socketIo = require("socket.io");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");

dotenv.config({ path: "./config.env" });

const app = express();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    // origin: "http://localhost:5173",
    origin: "https://evencen.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.user.id);

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("sendMessage", async ({ conversationId, text }) => {
    const message = new Message({
      conversation: conversationId,
      sender: socket.user.id,
      text,
    });
    await message.save();
    await message.populate("sender", "name profileImage");

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: text,
      lastMessageAt: new Date(),
    });

    io.to(conversationId).emit("message", message);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.user.id);
  });
});
app.set("io", io);

// Middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:3000"], // Add all frontend URLs
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400, // 24 hours
};

// Apply CORS before other middleware
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/hosts", hostRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
