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
const setupBookingExpiry = require("./utils/expirePendingBookings");
const setupGoogleCalendarSync = require("./utils/syncGoogleCalendars");
const setupOutlookCalendarSync = require("./utils/syncOutlookCalendars");
const setupCalcomCalendarSync = require("./utils/syncCalcomCalendars");
const setupCalendlyCalendarSync = require("./utils/syncCalendlyCalendars");
const setupAppleCalendarSync = require("./utils/syncAppleCalendars");

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
  "https://vencome.com",
  "https://www.vencome.com",
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

// Sync connected external calendars (Google Calendar / Outlook / iCal feeds)
// every 6 hours so external bookings block VenCome availability.
cron.schedule("0 */6 * * *", async () => {
  console.log("[Calendar Sync] Syncing connected external calendars...");
  try {
    const Property = require("./models/Property");
    const syncExternalCalendar = require("./utils/syncIcal");
    const properties = await Property.find({ icalUrl: { $exists: true, $ne: null } }).select("_id");
    for (const property of properties) {
      await syncExternalCalendar(property._id).catch((err) =>
        console.error(`[Calendar Sync] Failed for property ${property._id}:`, err.message)
      );
    }
    console.log(`[Calendar Sync] Done — checked ${properties.length} listing(s)`);
  } catch (err) {
    console.error("[Calendar Sync] Cron error:", err.message);
  }
});

// Auto-expire unanswered support-access requests after 24h — an unanswered
// request never falls back to silent access, it just expires.
cron.schedule("0 * * * *", async () => {
  try {
    const SupportAccessRequest = require("./models/SupportAccessRequest");
    const SupportAccessLog = require("./models/SupportAccessLog");
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await SupportAccessRequest.find({ status: "pending", requestedAt: { $lt: cutoff } });
    for (const request of stale) {
      request.status = "expired";
      await request.save();
      await SupportAccessLog.create({ user: request.user, request: request._id, action: "expired" });
    }
    if (stale.length > 0) console.log(`[Support Access] Expired ${stale.length} unanswered request(s)`);
  } catch (err) {
    console.error("[Support Access] Expiry cron error:", err.message);
  }
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
app.use("/api/chat/conversations", require("./routes/messages"));
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/hosts", hostRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/admin", require("./routes/admin"));
app.use("/api/calendar", require("./routes/calendarSync"));
app.use("/api/host-calendar", require("./routes/hostCalendar"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/support-access", require("./routes/supportAccess"));
app.use("/uploads", express.static("uploads"));
app.use("/api/blog", require("./routes/blog"));

// Dynamic sitemap
app.get("/sitemap.xml", async (req, res) => {
  try {
    const Property = require("./models/Property");
    const Category = require("./models/Category");
    const [properties, blogs, categories] = await Promise.all([
      Property.find({ isActive: true }).select("_id updatedAt").lean(),
      require("./models/Blog").find({ status: "published" }).select("slug updatedAt").lean(),
      Category.find({ status: "published" }).select("_id updatedAt").lean(),
    ]);

    const baseUrl = "https://www.vencome.com";
    const staticUrls = [
      { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
      { loc: `${baseUrl}/search`, priority: "0.9", changefreq: "daily" },
      { loc: `${baseUrl}/about`, priority: "0.6", changefreq: "monthly" },
      { loc: `${baseUrl}/contact`, priority: "0.6", changefreq: "monthly" },
    ];

    const propertyUrls = properties.map((p) => ({
      loc: `${baseUrl}/property/${p._id}`,
      priority: "0.8",
      changefreq: "weekly",
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().split("T")[0] : undefined,
    }));

    const blogUrls = blogs.map((b) => ({
      loc: `${baseUrl}/blog/${b.slug}`,
      priority: "0.7",
      changefreq: "monthly",
      lastmod: b.updatedAt ? new Date(b.updatedAt).toISOString().split("T")[0] : undefined,
    }));

    const categoryUrls = categories.map((c) => ({
      loc: `${baseUrl}/category/${c._id}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString().split("T")[0] : undefined,
    }));

    const allUrls = [...staticUrls, ...propertyUrls, ...blogUrls, ...categoryUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error("Sitemap error:", err);
    res.status(500).send("Error generating sitemap");
  }
});

// llms.txt - for AI crawlers
app.get("/llms.txt", (req, res) => {
  res.set("Content-Type", "text/plain");
  res.send(`# VenCome
> VenCome is a B2B commercial space rental marketplace connecting business hosts with professional tenants across the UK and Middle East.

## What We Do
VenCome allows businesses to list and book commercial spaces including offices, studios, meeting rooms, event venues, co-working spaces, medical rooms, retail units, and warehouses.

## Target Markets
- United Kingdom (London, Manchester, Birmingham, Edinburgh)
- Middle East (Dubai, Abu Dhabi, Riyadh, Doha)

## Key Features
- Instant booking and request-to-book flows
- Hourly, daily, weekly, monthly, and annual pricing
- Escrow-based payments with 10% platform commission
- Host verification and trust scoring
- Google Maps integration with price pins
- Real-time availability calendar

## User Types
- Customers (tenants) - search, book, and pay for commercial spaces
- Hosts (landlords) - list and manage commercial properties
- Admins - platform management and oversight

## Links
- [Homepage](https://www.vencome.com)
- [Search spaces](https://www.vencome.com/search)
- [List a space](https://www.vencome.com/create-space)
- [Blog](https://www.vencome.com/blog)
- [Contact](https://www.vencome.com/contact)
`);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
setupEscrowRelease();
setupBookingExpiry();
setupGoogleCalendarSync();
setupOutlookCalendarSync();
setupCalcomCalendarSync();
setupCalendlyCalendarSync();
setupAppleCalendarSync();
