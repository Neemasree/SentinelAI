import Redis from "ioredis";

let redis: Redis;

declare global {
  var redisClient: Redis | undefined;
}

if (process.env.NODE_ENV === "production") {
  redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
} else {
  if (!global.redisClient) {
    global.redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  }
  redis = global.redisClient;
}

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

redis.on("connect", () => {
  console.log("Redis connected");
});

export { redis };
