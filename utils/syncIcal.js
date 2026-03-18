const ical = require("node-ical");
const Property = require("../models/Property");

async function syncExternalCalendar(propertyId) {
  const property = await Property.findById(propertyId);
  if (!property.icalUrl) return;

  try {
    const events = await ical.fromURL(property.icalUrl);

    for (const event of Object.values(events)) {
      if (event.summary && event.start && event.end) {
        await Property.findByIdAndUpdate(propertyId, {
          $push: {
            blockedDates: {
              start: event.start,
              end: event.end,
              reason: "external",
              externalEventId: event.uid,
            },
          },
        });
      }
    }
  } catch (err) {
    console.error("iCal sync failed:", err);
  }
}

// Run daily via cron (add to server.js)
module.exports = syncExternalCalendar;
