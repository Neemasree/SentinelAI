import Redis from "ioredis";

declare global {
  var redisClient: Redis | undefined;
}

const redisState = { available: false };

const opts = { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 };
const url = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis;
if (process.env.NODE_ENV === "production") {
  redis = new Redis(url, opts);
} else {
  if (!global.redisClient) global.redisClient = new Redis(url, opts);
  redis = global.redisClient;
}

redis.on("error", (err) => {
  if (redisState.available) {
    const safe = String(err.message).replace(/[\r\n]/g, " ");
    console.warn("Redis unavailable, falling back to in-memory:", safe);
  }
  redisState.available = false;
});

redis.on("connect", () => {
  redisState.available = true;
  console.log("Redis connected");
});

/** Live flag — always reflects current connection state */
export const redisAvailable = redisState;
export { redis };
