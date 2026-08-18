const cron = require("node-cron");
const User = require("../models/User");
const Property = require("../models/Property");
const googleCalendar = require("./googleCalendar");

// Pull side of the two-way Google Calendar sync: for every host with a
// connected calendar, fetch their events and block the matching dates
// across ALL of their active listings. Runs alongside the existing
// per-listing iCal cron (utils/syncIcal.js) -- distinguished by prefixing
// externalEventId with "google:" so this job only ever touches blocks it
// created itself, never iCal-sourced ones on the same listing.
module.exports = function setupGoogleCalendarSync() {
  // Staggered against the other 4 external-calendar sync crons (Outlook,
  // Apple, Cal.com, Calendly) so they don't all fire at the same instant --
  // 5 concurrent syncs hitting external APIs + DB writes at once was a real
  // memory-pressure spike (server OOM'd right after one such batch).
  cron.schedule("0,30 * * * *", async () => {
    console.log("[Google Calendar Sync] Starting pull sync...");
    try {
      const hosts = await User.find({ "googleCalendar.connected": true }).select("googleCalendar");

      for (const host of hosts) {
        try {
          const events = await googleCalendar.listEvents(host.googleCalendar.refreshToken);
          const externalBlocks = events.map((event) => ({
            start: event.start,
            end: event.end,
            reason: "external",
            externalEventId: `google:${event.id}`,
          }));

          const listings = await Property.find({ host: host._id, isActive: true }).select("blockedDates");
          for (const listing of listings) {
            listing.blockedDates = [
              ...listing.blockedDates.filter((b) => !b.externalEventId?.startsWith("google:")),
              ...externalBlocks,
            ];
            await listing.save();
          }

          await User.findByIdAndUpdate(host._id, {
            "googleCalendar.lastSyncedAt": new Date(),
            "googleCalendar.lastSyncError": null,
          });
        } catch (err) {
          console.error(`[Google Calendar Sync] Failed for host ${host._id}:`, err.message);
          await User.findByIdAndUpdate(host._id, {
            "googleCalendar.lastSyncError": err.message,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Google Calendar Sync] Cron error:", err.message);
    }
  });
};
