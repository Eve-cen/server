const express = require("express");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const auth = require("../middleware/auth");
const router = express.Router();

// Maps the externalEventId prefix each sync job tags its blocks with (see
// utils/syncGoogleCalendars.js, syncOutlookCalendars.js, syncCalcomCalendars.js,
// syncCalendlyCalendars.js, syncAppleCalendars.js, syncIcal.js) to a
// display-friendly provider label for the calendar page.
function sourceFromExternalEventId(externalEventId) {
  if (!externalEventId) return "External";
  if (externalEventId.startsWith("google:")) return "Google Calendar";
  if (externalEventId.startsWith("outlook:")) return "Outlook";
  if (externalEventId.startsWith("calcom:")) return "Cal.com";
  if (externalEventId.startsWith("calendly:")) return "Calendly";
  if (externalEventId.startsWith("apple:")) return "Apple Calendar";
  return "iCal Feed"; // per-listing feed syncs (utils/syncIcal.js) tag with a bare uid, no prefix
}

// GET /host-calendar — everything the dedicated host calendar page needs in
// one call: this host's VenCome bookings (across all their listings) plus
// every synced external calendar block, so the frontend can render one
// unified calendar grid while still visually distinguishing VenCome
// bookings from externally-synced blocks. This is a read-only view — it
// doesn't touch the request/approve/decline workflow, which stays on the
// existing Bookings page.
router.get("/", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({
      host: req.user.id,
      status: { $in: ["pending", "confirmed", "completed"] },
    })
      .populate("property", "title coverImage")
      .populate("guest", "firstName lastName displayName profileImage")
      .sort({ checkIn: 1 });

    const properties = await Property.find({ host: req.user.id }).select(
      "title blockedDates"
    );

    const externalBlocks = [];
    for (const property of properties) {
      for (const block of property.blockedDates || []) {
        if (block.reason !== "external") continue;
        externalBlocks.push({
          propertyId: property._id,
          propertyTitle: property.title,
          start: block.start,
          end: block.end,
          source: sourceFromExternalEventId(block.externalEventId),
        });
      }
    }

    res.json({
      success: true,
      bookings: bookings.map((booking) => ({
        _id: booking._id,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        status: booking.status,
        totalPrice: booking.totalPrice,
        property: booking.property
          ? {
              _id: booking.property._id,
              title: booking.property.title,
              coverImage: booking.property.coverImage,
            }
          : null,
        guest: booking.guest
          ? {
              _id: booking.guest._id,
              name:
                booking.guest.displayName ||
                [booking.guest.firstName, booking.guest.lastName].filter(Boolean).join(" ") ||
                "Guest",
              profileImage: booking.guest.profileImage,
            }
          : null,
      })),
      externalBlocks,
    });
  } catch (err) {
    console.error("Host calendar error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
