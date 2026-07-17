const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Verify user still exists and is active
    const user = await User.findById(decoded.id).select("_id isVerified");
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Admin-only middleware
const adminAuth = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id isAdmin");
    if (!user || !user.isAdmin) return res.status(403).json({ error: "Admin access required" });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Blocks a specific action while the current session is an active admin
// "Account Access" impersonation (see routes/admin.js impersonate). Per the
// support-access spec, viewing/diagnosing is fine during a session, but
// changes to security-sensitive settings (password, payout method) need a
// separate explicit confirmation step, not silent access via impersonation.
const blockDuringImpersonation = (req, res, next) => {
  if (req.user?.impersonatedBy) {
    return res.status(403).json({
      error: "This action isn't available during a support access session.",
    });
  }
  next();
};

module.exports = auth;
module.exports.adminAuth = adminAuth;
module.exports.blockDuringImpersonation = blockDuringImpersonation;
