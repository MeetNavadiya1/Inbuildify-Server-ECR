import { createClient } from "redis";
import { env } from "../config/env.config.js";

const DEFAULT_TTL_SECONDS = 3600;

let redisClient = null;
let isConnected = false;

function getRedisConfig() {
  const host = env.REDIS?.REDIS_HOST;
  const port = Number(env.REDIS?.REDIS_PORT);
  const password = env.REDIS?.REDIS_PASSWORD;

  return {
    socket: { host, port },
    password: password || undefined,
  };
}

let connectPromise = null;

async function getClient() {
  if (isConnected && redisClient) {
    return redisClient;
  }

  if (!redisClient) {
    redisClient = createClient(getRedisConfig());
    redisClient.on("error", (error) => {
      isConnected = false;
      connectPromise = null;
      console.error("Redis cache error:", error.message);
    });
  }

  if (!isConnected) {
    if (!connectPromise) {
      connectPromise = redisClient.connect().then(() => {
        isConnected = true;
      }).catch(error => {
        connectPromise = null;
        throw error;
      });
    }
    await connectPromise;
  }

  return redisClient;
}

export async function getCache(key) {
  try {
    const client = await getClient();
    const rawValue = await client.get(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    console.error("Redis getCache failed:", error.message);
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    const client = await getClient();
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error("Redis setCache failed:", error.message);
  }
}

export async function deleteCache(key) {
  try {
    const client = await getClient();
    await client.del(key);
  } catch (error) {
    console.error("Redis deleteCache failed:", error.message);
  }
}

export async function deleteCacheByPrefix(prefix) {
  try {
    const client = await getClient();
    const keys = await client.keys(`${prefix}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error("Redis deleteCacheByPrefix failed:", error.message);
  }
}
