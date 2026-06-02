const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const authRoutes = require("./routes/auth");
const propertyRoutes = require("./routes/properties");
const categoryRoutes = require("./routes/categories");
const bookingRoutes = require("./routes/bookings");
const availabiltyRoutes = require("./routes/availability");
const reviewsRoutes = require("./routes/reviews");
const settingsRoutes = require("./routes/settings");
const profileRoutes = require("./routes/profile");
const uploadRoutes = require("./routes/upload");
const messageRoutes = require("./routes/messages");
const hostRoutes = require("./routes/hosts");
const paymentsWebhook = require("./routes/paymentsWebhook");
const paymentRoutes = require("./routes/payments");
const payoutRoutes = require("./routes/payouts");
const geocodeRoutes = require("./routes/geocode");
const notificationRoutes = require("./routes/notifications");
const verificationRoutes = require("./routes/verification");
const draftRoutes = require("./routes/drafts");
const chatRoutes = require("./routes/chat");
const http = require("http");
const socketIo = require("socket.io");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const setupEscrowRelease = require("./utils/releaseEscrow");

const cron = require("node-cron");
const markCompletedBookings = require("./jobs/markCompletedBookings");
const isSuspicious = require("./utils/suspicionEngine");
const { connectRedis } = require("./utils/redisClient");

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "./config.env" });
}

const app = express();

connectRedis().catch(console.error);

app.set("trust proxy", 1);
const server = http.createServer(app);
const allowedOrigins = [
  "http://localhost:5173",
  "https://vencome.netlify.app",
  "https://client-inky-nu-61.vercel.app",
];

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// const io = socketIo(server, {
//   cors: {
//     origin: true,
//     credentials: true,
//   },
// });

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

  socket.join(`user_${socket.user.id}`);

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId }) => {
    socket.to(conversationId).emit("typing", {
      userId: socket.user.id,
    });
  });

  socket.on("stopTyping", ({ conversationId }) => {
    socket.to(conversationId).emit("stopTyping", {
      userId: socket.user.id,
    });
  });

  socket.on("sendMessage", async ({ conversationId, text }) => {
    const flagged = isSuspicious(text);

    const message = new Message({
      conversation: conversationId,
      sender: socket.user.id,
      text,
      blocked: flagged,
      blockReason: flagged ? "Suspicious content detected" : null,
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
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400, // 24 hours
};
// Apply CORS before other middleware
app.use(cors(corsOptions));

cron.schedule("0 0 * * *", async () => {
  console.log("Running daily booking cleanup...");
  await markCompletedBookings();
});

app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsWebhook
);

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
app.use("/api/availability", availabiltyRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/profile", profileRoutes); // New
app.use("/api/messages", messageRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/hosts", hostRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
setupEscrowRelease();
