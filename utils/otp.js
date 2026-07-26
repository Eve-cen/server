const { client: redisClient } = require("./redisClient");

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const storeOTP = async (key, otp) => {
  await redisClient.setEx(`otp:${key}`, 600, otp); // 10 min TTL
};

const verifyOTP = async (key, otp) => {
  const stored = await redisClient.get(`otp:${key}`);
  if (!stored || stored !== otp) return false;
  await redisClient.del(`otp:${key}`);
  return true;
};

module.exports = { generateOTP, storeOTP, verifyOTP };
