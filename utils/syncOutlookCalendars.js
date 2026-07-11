const cron = require("node-cron");
const User = require("../models/User");
const Property = require("../models/Property");
const outlookCalendar = require("./outlookCalendar");

// Pull side of the two-way Outlook sync -- mirrors utils/syncGoogleCalendars.js.
// Blocks are tagged "outlook:" instead of "google:" so the two jobs (plus the
// per-listing iCal sync) never stomp on each other's blocks for the same listing.
module.exports = function setupOutlookCalendarSync() {
  cron.schedule("*/30 * * * *", async () => {
    console.log("[Outlook Sync] Starting pull sync...");
    try {
      const hosts = await User.find({ "outlookCalendar.connected": true }).select("outlookCalendar");

      for (const host of hosts) {
        try {
          const events = await outlookCalendar.listEvents(host.outlookCalendar.refreshToken);
          const externalBlocks = events.map((event) => ({
            start: event.start,
            end: event.end,
            reason: "external",
            externalEventId: `outlook:${event.id}`,
          }));

          const listings = await Property.find({ host: host._id, isActive: true }).select("blockedDates");
          for (const listing of listings) {
            listing.blockedDates = [
              ...listing.blockedDates.filter((b) => !b.externalEventId?.startsWith("outlook:")),
              ...externalBlocks,
            ];
            await listing.save();
          }

          await User.findByIdAndUpdate(host._id, {
            "outlookCalendar.lastSyncedAt": new Date(),
            "outlookCalendar.lastSyncError": null,
          });
        } catch (err) {
          console.error(`[Outlook Sync] Failed for host ${host._id}:`, err.message);
          await User.findByIdAndUpdate(host._id, {
            "outlookCalendar.lastSyncError": err.message,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Outlook Sync] Cron error:", err.message);
    }
  });
};
