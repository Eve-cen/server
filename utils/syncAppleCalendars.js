const cron = require("node-cron");
const User = require("../models/User");
const Property = require("../models/Property");
const appleCalendar = require("./appleCalendar");

// Pull-only sync -- mirrors utils/syncCalcomCalendars.js / syncCalendlyCalendars.js.
// Blocks are tagged "apple:" so this job never stomps on Google/Outlook/Cal.com/
// Calendly/iCal blocks for the same listing.
module.exports = function setupAppleCalendarSync() {
  cron.schedule("*/30 * * * *", async () => {
    console.log("[Apple Calendar Sync] Starting pull sync...");
    try {
      const hosts = await User.find({ "apple.connected": true }).select("apple");

      for (const host of hosts) {
        try {
          const events = await appleCalendar.listEvents(host.apple.username, host.apple.password);
          const externalBlocks = events.map((event) => ({
            start: event.start,
            end: event.end,
            reason: "external",
            externalEventId: `apple:${event.id}`,
          }));

          const listings = await Property.find({ host: host._id, isActive: true }).select("blockedDates");
          for (const listing of listings) {
            listing.blockedDates = [
              ...listing.blockedDates.filter((b) => !b.externalEventId?.startsWith("apple:")),
              ...externalBlocks,
            ];
            await listing.save();
          }

          await User.findByIdAndUpdate(host._id, {
            "apple.lastSyncedAt": new Date(),
            "apple.lastSyncError": null,
          });
        } catch (err) {
          console.error(`[Apple Calendar Sync] Failed for host ${host._id}:`, err.message);
          await User.findByIdAndUpdate(host._id, {
            "apple.lastSyncError": err.message,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Apple Calendar Sync] Cron error:", err.message);
    }
  });
};
