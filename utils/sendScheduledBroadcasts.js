const cron = require("node-cron");
const Broadcast = require("../models/Broadcast");
const { sendBroadcastNow } = require("../routes/admin");

module.exports = function setupScheduledBroadcasts() {
  cron.schedule("* * * * *", async () => {
    try {
      const due = await Broadcast.find({
        status: "scheduled",
        scheduledFor: { $lte: new Date() },
      });

      for (const broadcast of due) {
        try {
          await sendBroadcastNow(broadcast);
          console.log(`[Broadcast] Sent scheduled broadcast ${broadcast._id}`);
        } catch (err) {
          console.error(`[Broadcast] Failed to send scheduled broadcast ${broadcast._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[Scheduled Broadcasts Cron] Error:", err);
    }
  });
};
