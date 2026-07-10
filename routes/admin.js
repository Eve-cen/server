const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { adminAuth } = require("../middleware/auth");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const Report = require("../models/Report");
const Payment = require("../models/Payment");
const router = express.Router();

// ─── Admin login (separate from regular user login) ──────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Invalid admin credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(403).json({ error: "Invalid admin credentials" });
    }

    const token = jwt.sign(
      { id: user._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// All admin routes require adminAuth
router.use(adminAuth);

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [users, properties, bookings, reports, pendingVerifications, escrowPending] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments({ isActive: true }),
      Booking.countDocuments(),
      Report.countDocuments({ status: "open" }),
      User.countDocuments({ "businessVerification.status": "under_review" }),
      Booking.find({ isPaid: true, escrowReleased: false, status: "completed" }).select("hostAmount"),
    ]);
    const totalEscrow = escrowPending.reduce((s, b) => s + b.hostAmount, 0);
    res.json({ users, properties, bookings, openReports: reports, pendingVerifications, totalEscrowPending: totalEscrow });
  } catch { res.status(500).json({ error: "Server error" }); }
});

router.get("/overview-analytics", async (req, res) => {
  try {
    const Booking = require("../models/Booking");
    const Property = require("../models/Property");

    // Revenue & bookings by month, last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyBookings = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          status: { $in: ["confirmed", "completed"] },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const chartData = monthlyBookings.map((m) => ({
      month: monthNames[m._id.month - 1],
      revenue: m.revenue || 0,
      bookings: m.bookings || 0,
    }));

    // Listings by category
    const categoryBreakdown = await Property.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$categoryInfo.name", "Uncategorized"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      chartData,
      categoryData: categoryBreakdown.map((c) => ({ name: c.name, count: c.count })),
    });
  } catch (err) {
    console.error("Error fetching overview analytics:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  const { page = 1, limit = 20, q, role } = req.query;
  const filter = {};
  if (q) filter.$or = [{ email: { $regex: q, $options: "i" } }, { firstName: { $regex: q, $options: "i" } }];
  if (role === "host") filter.isHost = true;
  if (role === "admin") filter.isAdmin = true;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [users, total] = await Promise.all([
    User.find(filter).select("-password -otp -otpExpires").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);
  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.patch("/users/:id/ban", async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: req.body.ban ?? true }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.patch("/users/:id/admin", async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isAdmin: req.body.isAdmin ?? true }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// ─── Verifications ────────────────────────────────────────────────────────────
router.get("/verifications", async (req, res) => {
  const users = await User.find({ "businessVerification.status": "under_review" })
    .select("firstName lastName email businessVerification")
    .sort({ "businessVerification.submittedAt": 1 });
  res.json(users);
});

router.patch("/verifications/:userId", async (req, res) => {
  const { status, notes } = req.body; // status: "verified" | "rejected"
  if (!["verified", "rejected"].includes(status))
    return res.status(400).json({ error: "Status must be verified or rejected" });

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    {
      "businessVerification.status": status,
      businessVerified: status === "verified",
      "businessVerification.resolvedAt": new Date(),
      "businessVerification.notes": notes,
    },
    { new: true }
  ).select("firstName lastName email businessVerification businessVerified");

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// ─── Reports ─────────────────────────────────────────────────────────────────
router.get("/reports", async (req, res) => {
  const { status = "open", page = 1, limit = 20 } = req.query;
  const filter = status !== "all" ? { status } : {};
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [reports, total] = await Promise.all([
    Report.find(filter).populate("reporter", "firstName lastName email").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Report.countDocuments(filter),
  ]);
  res.json({ reports, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.patch("/reports/:id", async (req, res) => {
  const { status, notes } = req.body;
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status, notes, resolvedBy: req.user.id, resolvedAt: new Date() },
    { new: true }
  );
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

// ─── Properties ───────────────────────────────────────────────────────────────
router.get("/properties", async (req, res) => {
  const { page = 1, limit = 20, q } = req.query;
  const filter = {};
  if (q) filter.title = { $regex: q, $options: "i" };
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [properties, total] = await Promise.all([
    Property.find(filter).populate("host", "firstName lastName email displayName").populate("category", "name").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Property.countDocuments(filter),
  ]);
  res.json({ properties, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.patch("/properties/:id", async (req, res) => {
  const { isActive } = req.body;
  const property = await Property.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
  if (!property) return res.status(404).json({ error: "Property not found" });
  res.json(property);
});

// ─── Payouts (escrow) ─────────────────────────────────────────────────────────
router.get("/payouts/pending", async (req, res) => {
  const bookings = await Booking.find({ isPaid: true, escrowReleased: false, status: "completed" })
    .populate("host", "firstName lastName email stripeAccountId")
    .populate("property", "title")
    .sort({ checkOut: 1 });
  res.json(bookings);
});

// GET /admin/bookings — all bookings across the platform
router.get("/bookings", async (req, res) => {
  try {
    const Booking = require("../models/Booking");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const status = req.query.status;

    const query = status && status !== "all" ? { status } : {};

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate("property", "title location coverImage")
        .populate("guest", "firstName lastName displayName email")
        .populate("host", "firstName lastName displayName email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Booking.countDocuments(query),
    ]);

    res.json({ success: true, bookings, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("Admin bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /admin/payments — payment overview from bookings
router.get("/payments", async (req, res) => {
  try {
    const range = req.query.range || "30";
    const days = parseInt(range) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const bookings = await Booking.find({ isPaid: true, createdAt: { $gte: since } })
      .populate("property", "title location")
      .populate("guest", "firstName lastName displayName email")
      .populate("host", "firstName lastName displayName email")
      .sort({ createdAt: -1 })
      .limit(100);

    const allPaid = await Booking.find({ isPaid: true });
    const gmv = allPaid.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const platformRevenue = allPaid.reduce((sum, b) => sum + (b.platformFee || 0), 0);
    const inEscrow = await Booking.find({ isPaid: true, escrowReleased: false, status: { $in: ["confirmed", "pending"] } });
    const escrowTotal = inEscrow.reduce((sum, b) => sum + (b.hostAmount || 0), 0);
    const awaitingPayout = await Booking.find({ isPaid: true, escrowReleased: false, status: "completed" });
    const awaitingTotal = awaitingPayout.reduce((sum, b) => sum + (b.hostAmount || 0), 0);

    res.json({
      success: true,
      stats: { gmv, platformRevenue, inEscrow: escrowTotal, awaitingPayout: awaitingTotal },
      transactions: bookings.map((b) => ({
        id: b._id.toString().slice(-8).toUpperCase(),
        bookingRef: b._id.toString().slice(-8).toUpperCase(),
        customer: b.guest?.displayName || [b.guest?.firstName, b.guest?.lastName].filter(Boolean).join(" ") || b.guest?.email || "—",
        host: b.host?.displayName || [b.host?.firstName, b.host?.lastName].filter(Boolean).join(" ") || b.host?.email || "—",
        space: b.property?.title || "—",
        amount: b.totalPrice || 0,
        commission: b.platformFee || 0,
        hostPayout: b.hostAmount || 0,
        status: b.escrowReleased ? "completed" : b.status === "cancelled" ? "refunded" : "escrow_held",
        date: b.createdAt,
        currency: "GBP",
      })),
    });
  } catch (err) {
    console.error("Admin payments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /admin/broadcast — send email to all/hosts/customers
router.post("/broadcast", async (req, res) => {
  try {
    const { subject, message, target } = req.body;
    if (!subject || !message) return res.status(400).json({ error: "Subject and message are required" });

    const query = target === "hosts" ? { isHost: true } : target === "customers" ? { isHost: false } : {};
    const users = await User.find(query).select("email firstName displayName").lean();

    if (!users.length) return res.status(400).json({ error: "No users found for this target" });

    const sendEmail = require("../utils/sendEmail");
    const emailPromises = users.map(user => {
      const name = user.displayName || user.firstName || "there";
      return sendEmail({
        to: user.email,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <img src="https://vencome.com/VenCome.jpg" alt="VenCome" style="height:40px;margin-bottom:24px;" />
            <p>Hi ${name},</p>
            <div style="font-size:15px;line-height:1.7;color:#374151;">
              ${message.replace(/\n/g, "<br/>")}
            </div>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
            <p style="font-size:12px;color:#9CA3AF;">You received this email because you are a registered VenCome user. © ${new Date().getFullYear()} VenCome</p>
          </div>
        `,
      }).catch(err => console.error(`Failed to send to ${user.email}:`, err.message));
    });

    await Promise.allSettled(emailPromises);
    res.json({ success: true, sent: users.length });
  } catch (err) {
    console.error("Broadcast error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /admin/users/:id/verify — grant or revoke VenCome Verified
router.post("/users/:id/verify", async (req, res) => {
  try {
    const { action } = req.body; // "grant" or "revoke"
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (action === "grant") {
      user.venComeVerified = true;
      user.venComeVerifiedAt = new Date();
    } else {
      user.venComeVerified = false;
      user.venComeVerifiedAt = null;
    }
    await user.save();

    const sendEmail = require("../utils/sendEmail");
    const name = user.displayName || user.firstName || "there";
    if (action === "grant") {
      sendEmail({
        to: user.email,
        subject: "You are now VenCome Verified ✓",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <img src="https://vencome.com/VenCome.jpg" alt="VenCome" style="height:40px;margin-bottom:24px;" />
            <h2 style="color:#0A1628;">Congratulations, ${name}! 🎉</h2>
            <p>Your VenCome account has been officially verified. You will now display the <strong>VenCome Verified ✓</strong> badge on your profile and listings.</p>
            <p>This badge shows customers that you are a trusted, professional host on the platform.</p>
            <a href="https://www.vencome.com" style="display:inline-block;padding:14px 28px;background:#305CDE;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">View Your Profile</a>
            <p style="color:#6B7280;font-size:13px;margin-top:24px;">The VenCome Team</p>
          </div>
        `,
      }).catch(console.error);
    }

    res.json({ success: true, user: { _id: user._id, venComeVerified: user.venComeVerified } });
  } catch (err) {
    console.error("Verify user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /admin/users/:id/apply-verified — host applies for verified status
router.post("/users/:id/apply-verified", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.venComeVerifiedAppliedAt = new Date();
    await user.save();
    res.json({ success: true, message: "Application submitted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
