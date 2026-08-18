const cron = require("node-cron");
const User = require("../models/User");
const Property = require("../models/Property");
const calendlyCalendar = require("./calendlyCalendar");

// Pull-only sync -- mirrors utils/syncCalcomCalendars.js. Blocks are tagged
// "calendly:" so this job never stomps on Google/Outlook/Cal.com/iCal blocks
// for the same listing.
module.exports = function setupCalendlyCalendarSync() {
  // Staggered against the other 4 external-calendar sync crons -- see
  // syncGoogleCalendars.js for why.
  cron.schedule("8,38 * * * *", async () => {
    console.log("[Calendly Sync] Starting pull sync...");
    try {
      const hosts = await User.find({ "calendly.connected": true }).select("calendly");

      for (const host of hosts) {
        try {
          const events = await calendlyCalendar.listEvents(host.calendly.refreshToken);
          const externalBlocks = events.map((event) => ({
            start: event.start,
            end: event.end,
            reason: "external",
            externalEventId: `calendly:${event.id}`,
          }));

          const listings = await Property.find({ host: host._id, isActive: true }).select("blockedDates");
          for (const listing of listings) {
            listing.blockedDates = [
              ...listing.blockedDates.filter((b) => !b.externalEventId?.startsWith("calendly:")),
              ...externalBlocks,
            ];
            await listing.save();
          }

          await User.findByIdAndUpdate(host._id, {
            "calendly.lastSyncedAt": new Date(),
            "calendly.lastSyncError": null,
          });
        } catch (err) {
          console.error(`[Calendly Sync] Failed for host ${host._id}:`, err.message);
          await User.findByIdAndUpdate(host._id, {
            "calendly.lastSyncError": err.message,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Calendly Sync] Cron error:", err.message);
    }
  });
};
