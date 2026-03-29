const express = require("express");
const { adminAuth } = require("../middleware/auth");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const Report = require("../models/Report");
const Payment = require("../models/Payment");
const router = express.Router();

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
    Property.find(filter).populate("host", "firstName lastName email").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
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

module.exports = router;
