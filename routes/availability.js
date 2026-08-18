const express = require("express");
const router = express.Router({ mergeParams: true }); // ← must have this
const Property = require("../models/Property");
const auth = require("../middleware/auth");

// ─── Helpers ────────────────────────────────────────────────────────────────

const toDateOnly = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart <= bEnd && aEnd >= bStart;

// ─── GET /api/properties/availability ───────────────────────────────────
// Returns availability settings, blocked dates, and booked dates

router.get("/:id/availability", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id).select(
      "title availability customAvailability blockedDates icalUrl host unitsCount"
    );

    if (!property)
      return res.status(404).json({ message: "Property not found" });
    if (property.host.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Not authorised" });

    // Split blockedDates into manual blocks vs booked
    const blockedDates = property.blockedDates
      .filter((b) => b.reason !== "booked" && b.start && b.end)
      .map((b) => ({
        id: b._id,
        start: b.start.toISOString().split("T")[0],
        end: b.end.toISOString().split("T")[0],
        reason: b.reason,
        unitIndex: b.unitIndex ?? null,
      }));

    const bookedDates = property.blockedDates
      .filter((b) => b.reason === "booked" && b.start && b.end)
      .map((b) => ({
        id: b._id,
        start: b.start.toISOString().split("T")[0],
        end: b.end.toISOString().split("T")[0],
        bookingId: b.bookingId,
        unitIndex: b.unitIndex ?? null,
      }));

    res.json({
      id: property._id,
      title: property.title,
      availability: property.availability,
      customAvailability: property.customAvailability,
      icalUrl: property.icalUrl,
      unitsCount: property.unitsCount || 1,
      blockedDates,
      bookedDates,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/properties/availability ──────────────────────────────────
// Save default availability rule + customAvailability

router.post("/:id/availability", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });
    if (property.host.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Not authorised" });

    const { availability, customAvailability, icalUrl } = req.body;

    if (availability) property.availability = availability;
    if (customAvailability) property.customAvailability = customAvailability;
    if (icalUrl !== undefined) property.icalUrl = icalUrl;

    await property.save();
    res.json({ message: "Availability saved" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/properties/block ─────────────────────────────────────────
// Add a blocked date range (manual block / maintenance / personal)

router.post("/:id/block", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });
    if (property.host.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Not authorised" });

    const { start, end, reason = "manual", unitIndex = null } = req.body;
    if (!start || !end)
      return res.status(400).json({ message: "start and end are required" });

    const startDate = toDateOnly(start);
    const endDate = toDateOnly(end);
    if (startDate > endDate)
      return res.status(400).json({ message: "start must be before end" });

    // Reject only if the SAME unit (or "all", when unitIndex is null) is
    // already occupied by an existing booking -- a listing with several
    // identical units can have one blocked for maintenance while the
    // others stay bookable.
    const conflict = property.blockedDates.find((b) => {
      if (b.reason !== "booked") return false;
      if (!rangesOverlap(startDate, endDate, toDateOnly(b.start), toDateOnly(b.end))) return false;
      if (unitIndex == null || b.unitIndex == null) return true; // "all" always conflicts with any booking
      return b.unitIndex === unitIndex;
    });
    if (conflict)
      return res
        .status(409)
        .json({ message: "Range overlaps an existing booking" });

    property.blockedDates.push({ start: startDate, end: endDate, reason, unitIndex });
    await property.save();

    const added = property.blockedDates[property.blockedDates.length - 1];
    res.status(201).json({
      id: added._id,
      start: added.start.toISOString().split("T")[0],
      end: added.end.toISOString().split("T")[0],
      reason: added.reason,
      unitIndex: added.unitIndex ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/properties/block/:blockId ───────────────────────────────
// Remove a specific blocked date range by its subdocument _id

router.delete("/:id/block/:blockId", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });
    if (property.host.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Not authorised" });

    const block = property.blockedDates.id(req.params.blockId);
    if (!block) return res.status(404).json({ message: "Block not found" });
    if (block.reason === "booked")
      return res
        .status(403)
        .json({ message: "Cannot manually remove a booked date" });

    block.deleteOne();
    await property.save();
    res.json({ message: "Block removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/properties/block (by date string) ──────────────────────
// Unblock a single date — removes any manual block that contains that date
// Used by the calendar's single-click toggle

router.delete("/:id/block", auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });
    if (property.host.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Not authorised" });

    const { date } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const target = toDateOnly(date);

    const before = property.blockedDates.length;
    property.blockedDates = property.blockedDates.filter((b) => {
      if (b.reason === "booked") return true; // never remove bookings this way
      return !(toDateOnly(b.start) <= target && target <= toDateOnly(b.end));
    });

    if (property.blockedDates.length === before)
      return res.status(404).json({ message: "No block found for that date" });

    await property.save();
    res.json({ message: "Date unblocked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
