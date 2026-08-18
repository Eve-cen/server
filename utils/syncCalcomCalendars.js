const cron = require("node-cron");
const User = require("../models/User");
const Property = require("../models/Property");
const calcomCalendar = require("./calcomCalendar");

// Pull-only sync -- mirrors utils/syncOutlookCalendars.js, but Cal.com has no
// push side (see utils/calcomCalendar.js for why). Blocks are tagged
// "calcom:" so this job never stomps on Google/Outlook/iCal blocks for the
// same listing.
module.exports = function setupCalcomCalendarSync() {
  // Staggered against the other 4 external-calendar sync crons -- see
  // syncGoogleCalendars.js for why.
  cron.schedule("6,36 * * * *", async () => {
    console.log("[Cal.com Sync] Starting pull sync...");
    try {
      const hosts = await User.find({ "calcom.connected": true }).select("calcom");

      for (const host of hosts) {
        try {
          const bookings = await calcomCalendar.listBookings(host.calcom.apiKey);
          const externalBlocks = bookings.map((booking) => ({
            start: booking.start,
            end: booking.end,
            reason: "external",
            externalEventId: `calcom:${booking.id}`,
          }));

          const listings = await Property.find({ host: host._id, isActive: true }).select("blockedDates");
          for (const listing of listings) {
            listing.blockedDates = [
              ...listing.blockedDates.filter((b) => !b.externalEventId?.startsWith("calcom:")),
              ...externalBlocks,
            ];
            await listing.save();
          }

          await User.findByIdAndUpdate(host._id, {
            "calcom.lastSyncedAt": new Date(),
            "calcom.lastSyncError": null,
          });
        } catch (err) {
          console.error(`[Cal.com Sync] Failed for host ${host._id}:`, err.message);
          await User.findByIdAndUpdate(host._id, {
            "calcom.lastSyncError": err.message,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Cal.com Sync] Cron error:", err.message);
    }
  });
};
