const Notification = require("../models/Notification");

async function createNotification(io, { userId, type, title, body, link, meta }) {
  const notification = await Notification.create({ user: userId, type, title, body, link, meta });
  io?.to(`user_${userId}`).emit("notification", notification);
  return notification;
}

module.exports = createNotification;
