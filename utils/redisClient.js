const { createClient } = require("redis");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const client = createClient({
  username: process.env.REDIS_USERNAME || "default",
  password: process.env.REDIS_PW,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

client.on("error", (err) => console.error("Redis Client Error", err));

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
    console.log("Redis connected successfully");
  }
}

module.exports = { client, connectRedis };
