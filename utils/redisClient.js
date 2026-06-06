const { createClient } = require("redis");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

client.on("error", (err) => console.error("Redis Client Error", err));

async function connectRedis() {
  if (!client.isOpen) {
    try {
      await client.connect();
      console.log("Redis connected successfully");
    } catch (err) {
      console.warn("Redis unavailable — continuing without Redis:", err.message);
    }
  }
}

module.exports = { client, connectRedis };
