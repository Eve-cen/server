const express = require("express");
const fs = require("fs");
const multer = require("multer");
const SupportTicket = require("../models/SupportTicket");
const Counter = require("../models/Counter");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { generalLimiter } = require("../middleware/rateLimiter");
const uploadToR2 = require("../utils/uploadService");
const createNotification = require("../utils/notify");
const sendEmail = require("../utils/sendEmail");
const router = express.Router();

const ADMIN_ROLES = ["full_admin", "support"];
const SENDER_POPULATE = "displayName firstName lastName profileImage";

// Same multer/R2 pattern as routes/profile.js — temp disk storage, uploaded
// to R2, then the temp file is removed. Message attachments are capped at
// 1 image per message for v1 (see plan).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/temp/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
});

const notifyAdmins = async (io, admins, { type, title, body, meta }) => {
  for (const admin of admins) {
    await createNotification(io, {
      userId: admin._id,
      type,
      title,
      body,
      link: "/admin",
      meta,
    }).catch((err) => console.error("Failed to notify admin:", err.message));
  }
};

// POST /api/support/tickets — create a ticket with its first message.
router.post("/tickets", auth, generalLimiter, async (req, res) => {
  const { category, subject, message, relatedBooking, relatedProperty, attachments } = req.body;
  if (!category || !subject || !message) {
    return res.status(400).json({ error: "category, subject and message are required" });
  }

  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: "supportTicket" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const ticketNumber = `VC-${1000 + counter.seq}`;

    const priority = category === "trust_safety" ? "urgent" : "normal";

    const ticket = await SupportTicket.create({
      ticketNumber,
      user: req.user.id,
      category,
      subject,
      priority,
      relatedBooking: relatedBooking || undefined,
      relatedProperty: relatedProperty || undefined,
      messages: [
        {
          sender: req.user.id,
          senderRole: "customer",
          body: message,
          attachments: Array.isArray(attachments) ? attachments : [],
        },
      ],
      lastMessageAt: new Date(),
      lastMessageBy: "customer",
    });

    // Notify + email every support-tier admin so new hires with the
    // "support" adminRole are covered automatically (not a hardcoded list).
    try {
      const admins = await User.find({ isAdmin: true, adminRole: { $in: ADMIN_ROLES } });
      const io = req.app.get("io");

      await notifyAdmins(io, admins, {
        type: "ticket_created",
        title: `New support ticket ${ticketNumber}`,
        body: subject,
        meta: { ticketId: ticket._id },
      });

      const adminEmails = admins.map((a) => a.email).filter(Boolean);
      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          subject: `New support ticket ${ticketNumber}: ${subject}`,
          html: `
            <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #f4f4f7; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
                  <img src="https://vencome.com/VenCome.jpg" alt="VenCome" style="max-width: 150px;">
                </div>
                <div style="padding: 30px; color: #333;">
                  <h2 style="color: #305CDE; text-align: center; margin-top: 0;">New Support Ticket</h2>
                  <div style="background-color: #f5f7ff; padding: 20px; margin: 25px 0; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                      <tr><td style="padding: 6px 0; color: #666;">Ticket</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${ticketNumber}</td></tr>
                      <tr><td style="padding: 6px 0; color: #666;">Category</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${category}</td></tr>
                      <tr><td style="padding: 6px 0; color: #666;">Priority</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${priority}</td></tr>
                      <tr><td style="padding: 6px 0; color: #666;">Subject</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${subject}</td></tr>
                    </table>
                  </div>
                  <p style="color: #333;">${message}</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.vencome.com/admin" style="display: inline-block; background-color: #305CDE; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Open in Admin Panel</a>
                  </div>
                </div>
                <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                  This is an automated message, please do not reply.<br />
                  © ${new Date().getFullYear()} VenCome. All rights reserved.
                </div>
              </div>
            </div>
          `,
        });
      }
    } catch (err) {
      console.error("Failed to notify admins of new ticket:", err.message);
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Support ticket creation error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/support/tickets — caller's own tickets, paginated.
router.get("/tickets", auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      SupportTicket.find({ user: req.user.id })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SupportTicket.countDocuments({ user: req.user.id }),
    ]);

    res.json({ tickets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error("List support tickets error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/support/tickets/:id — thread. Owner or any admin can view.
router.get("/tickets/:id", auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate("messages.sender", SENDER_POPULATE);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const isOwner = ticket.user.toString() === req.user.id;
    if (!isOwner) {
      const requester = await User.findById(req.user.id).select("isAdmin");
      if (!requester?.isAdmin) return res.status(403).json({ error: "Not authorized" });
    }

    res.json(ticket);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ error: "Ticket not found" });
    console.error("Get support ticket error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/support/tickets/:id/messages — reply, optionally with 1 image
// attachment (multipart field "attachment"). Responds with the updated
// ticket (not just the new message) so the frontend can re-render the whole
// thread + status/lastMessage fields off a single response.
router.post("/tickets/:id/messages", auth, upload.single("attachment"), async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const isOwner = ticket.user.toString() === req.user.id;
    let isAdminCaller = false;
    if (!isOwner) {
      const requester = await User.findById(req.user.id).select("isAdmin");
      isAdminCaller = !!requester?.isAdmin;
      if (!isAdminCaller) return res.status(403).json({ error: "Not authorized" });
    }

    const { body } = req.body;
    if (!body) return res.status(400).json({ error: "body is required" });

    const attachments = [];
    if (req.file) {
      try {
        const result = await uploadToR2(req.file.path, req.file.filename, req.file.mimetype);
        attachments.push(result.location);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error(uploadError);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: "Attachment upload failed" });
      }
    }

    const senderRole = isOwner ? "customer" : "admin";

    ticket.messages.push({ sender: req.user.id, senderRole, body, attachments });
    ticket.lastMessageAt = new Date();
    ticket.lastMessageBy = senderRole;

    if (senderRole === "customer" && ["resolved", "waiting_on_user"].includes(ticket.status)) {
      ticket.status = "open";
    }

    await ticket.save();
    await ticket.populate("messages.sender", SENDER_POPULATE);

    const newMessage = ticket.messages[ticket.messages.length - 1];
    const io = req.app.get("io");
    io?.to(`ticket_${ticket._id}`).emit("ticket_message", {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      message: newMessage,
    });

    // Notify the other party.
    try {
      if (senderRole === "customer") {
        if (ticket.assignedAdmin) {
          await notifyAdmins(io, [{ _id: ticket.assignedAdmin }], {
            type: "ticket_reply",
            title: `New reply on ${ticket.ticketNumber}`,
            body,
            meta: { ticketId: ticket._id },
          });
        } else {
          const admins = await User.find({ isAdmin: true, adminRole: { $in: ADMIN_ROLES } });
          await notifyAdmins(io, admins, {
            type: "ticket_reply",
            title: `New reply on ${ticket.ticketNumber}`,
            body,
            meta: { ticketId: ticket._id },
          });
        }
      } else {
        await createNotification(io, {
          userId: ticket.user,
          type: "ticket_reply",
          title: `New reply on ${ticket.ticketNumber}`,
          body,
          link: `/support/tickets/${ticket._id}`,
          meta: { ticketId: ticket._id },
        });
      }
    } catch (err) {
      console.error("Failed to notify ticket reply:", err.message);
    }

    res.json(ticket);
  } catch (err) {
    console.error("Post support ticket message error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
