const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const socketIo = require("socket.io");
const cron = require("node-cron");

dotenv.config({ path: "./config.env" });

const app = express();

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.set("trust proxy", true);

const allowedOrigins = ["http://localhost:5173", process.env.CLIENT_URL].filter(
  Boolean
);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};
app.use(cors(corsOptions));

// Stripe webhook must come before body parsers
const paymentsWebhook = require("./routes/paymentsWebhook");
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsWebhook
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

const { connectRedis } = require("./utils/redisClient");
connectRedis().catch(console.error);

mongoose
  .connect(process.env.DATABASE)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
});

const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const isSuspicious = require("./utils/suspicionEngine");

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;
  socket.join(`user_${userId}`);

  socket.on("joinConversation", async (conversationId) => {
    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });
    if (!conv) return socket.emit("error", { message: "Access denied" });
    socket.join(conversationId);
  });

  socket.on("typing", ({ conversationId }) =>
    socket.to(conversationId).emit("typing", { userId })
  );
  socket.on("stopTyping", ({ conversationId }) =>
    socket.to(conversationId).emit("stopTyping", { userId })
  );

  socket.on("sendMessage", async ({ conversationId, text }) => {
    try {
      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId,
      });
      if (!conv) return;
      const flagged = isSuspicious(text);
      const message = new Message({
        conversation: conversationId,
        sender: userId,
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
    } catch (err) {
      console.error("Socket sendMessage error:", err);
    }
  });

  socket.on("disconnect", () => console.log("User disconnected:", userId));
});

app.set("io", io);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/properties", require("./routes/properties"));
app.use("/api/categories", require("./routes/categories"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/availability", require("./routes/availability"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/hosts", require("./routes/hosts"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/payouts", require("./routes/payouts"));
app.use("/api/geocode", require("./routes/geocode"));
app.use("/api/verification", require("./routes/verification"));
app.use("/api/drafts", require("./routes/drafts"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/search", require("./routes/search"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/reports", require("./routes/reports"));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date() })
);

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;
  res.status(status).json({ error: message });
});

const markCompletedBookings = require("./jobs/markCompletedBookings");
const setupEscrowRelease = require("./utils/releaseEscrow");

cron.schedule("0 0 * * *", async () => {
  console.log("Running daily booking cleanup...");
  await markCompletedBookings();
});

setupEscrowRelease();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
