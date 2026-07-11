const ical = require("node-ical");
const Property = require("../models/Property");

// One-way sync: pulls events from a host's external calendar (Google Calendar,
// Outlook, Apple iCal, Calendly, Cal.com — anything that exposes an .ics feed)
// and blocks those dates on the VenCome listing. Safe to run repeatedly:
// existing externally-synced blocks are replaced rather than duplicated.
async function syncExternalCalendar(propertyId) {
  const property = await Property.findById(propertyId);
  if (!property || !property.icalUrl) return { synced: 0 };

  try {
    const events = await ical.fromURL(property.icalUrl);

    const externalBlocks = Object.values(events)
      .filter((event) => event.type === "VEVENT" && event.start && event.end)
      .map((event) => ({
        start: event.start,
        end: event.end,
        reason: "external",
        externalEventId: event.uid,
      }));

    // Drop old externally-synced blocks and replace with the fresh set —
    // keeps the list accurate if events were moved/deleted on the source calendar.
    property.blockedDates = [
      ...property.blockedDates.filter((b) => b.reason !== "external"),
      ...externalBlocks,
    ];
    property.icalLastSyncedAt = new Date();
    property.icalLastSyncError = undefined;
    await property.save();

    return { synced: externalBlocks.length };
  } catch (err) {
    property.icalLastSyncError = err.message;
    await property.save().catch(() => {});
    throw err;
  }
}

module.exports = syncExternalCalendar;
