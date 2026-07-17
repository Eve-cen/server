const express = require("express");
const router = express.Router();
const SupportAccessRequest = require("../models/SupportAccessRequest");
const SupportAccessLog = require("../models/SupportAccessLog");
const User = require("../models/User");

// Public (token-based, not session-auth) routes for the "grant or deny"
// screen a user lands on from their support-access email/notification. The
// token itself — long, random, single-purpose, emailed only to the account
// owner — is the credential here, so this deliberately isn't a login page.

// GET /api/support-access/:token — details for the grant/deny screen.
router.get("/:token", async (req, res) => {
  try {
    const request = await SupportAccessRequest.findOne({ token: req.params.token })
      .populate("admin", "firstName lastName displayName")
      .populate("user", "firstName lastName displayName");
    if (!request) return res.status(404).json({ error: "This link isn't valid." });

    // A pending request past its 24h answer window is treated as expired
    // even if the cron hasn't swept it yet.
    if (
      request.status === "pending" &&
      Date.now() - new Date(request.requestedAt).getTime() > 24 * 60 * 60 * 1000
    ) {
      request.status = "expired";
      await request.save();
    }

    res.json({
      status: request.status,
      reason: request.reason,
      requestedAt: request.requestedAt,
      respondedAt: request.respondedAt,
      adminName:
        request.admin?.displayName ||
        [request.admin?.firstName, request.admin?.lastName].filter(Boolean).join(" ") ||
        "VenCome Support",
      sessionExpiresAt: request.sessionExpiresAt,
    });
  } catch (err) {
    console.error("Get support access request error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/support-access/:token/respond — { action: "grant" | "deny" }
router.post("/:token/respond", async (req, res) => {
  try {
    const { action } = req.body;
    if (!["grant", "deny"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const request = await SupportAccessRequest.findOne({ token: req.params.token });
    if (!request) return res.status(404).json({ error: "This link isn't valid." });
    if (request.status !== "pending") {
      return res.status(409).json({ error: `This request was already ${request.status}.` });
    }
    if (Date.now() - new Date(request.requestedAt).getTime() > 24 * 60 * 60 * 1000) {
      request.status = "expired";
      await request.save();
      await SupportAccessLog.create({ user: request.user, request: request._id, action: "expired" });
      return res.status(409).json({ error: "This request has expired." });
    }

    request.status = action === "grant" ? "granted" : "denied";
    request.respondedAt = new Date();
    if (action === "grant") {
      request.sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h session
    }
    await request.save();

    await SupportAccessLog.create({
      user: request.user,
      admin: request.admin,
      request: request._id,
      action: request.status,
    });

    res.json({ status: request.status, sessionExpiresAt: request.sessionExpiresAt });
  } catch (err) {
    console.error("Respond to support access request error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
