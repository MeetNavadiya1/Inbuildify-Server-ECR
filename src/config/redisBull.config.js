import Redis from "ioredis";
import { env } from "./env.config.js";

const redisConfig = {
  host: env.REDIS.REDIS_HOST,
  port: env.REDIS.REDIS_PORT,
  password: env.REDIS.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

/**
 * The Redis keyspace this deployment's queues live under.
 *
 * Bull defaults every queue to the prefix `bull:`, which is fine when one Redis
 * serves one database and a disaster when it does not. This one does not: Redis
 * is a shared cloud instance while `DB_NAME` is per-developer and per-checkout,
 * so `bull:sampleDataQueue` was a single bus that every environment pushed to
 * and pulled from.
 *
 * A job carries nothing but ids — company, builder, user, request — and those
 * ids only mean anything in the database they were written in. Whichever worker
 * reached the job first ran it against ITS database, where the same ids are
 * absent, so an import queued here was failed over there with "the user this
 * import would be attributed to does not exist", and the request row here was
 * left on IMPORTING with no worker ever coming back to it. Emails and PDFs ride
 * the same buses and cross the same way.
 *
 * Keying the prefix on the database makes a job visible only to a worker holding
 * the rows it names. Host as well as name because a developer pointed at a
 * shared staging database should not share a queue with one running a local copy
 * that happens to have the same name.
 *
 * Two environments that genuinely share a host and a database name — two people
 * both on `localhost/term2` — still collide, and no automatic rule can tell them
 * apart without splitting a real multi-instance deployment into instances that
 * cannot see each other's work. Set `QUEUE_PREFIX` explicitly for that.
 *
 * Changing this strands anything already queued under the old prefix: the jobs
 * stay in Redis, and no worker looks there any more.
 */
const sanitiseKeyPart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const BULL_PREFIX = (() => {
  const scope = [env.DB?.DB_HOST, env.DB?.DB_NAME].map(sanitiseKeyPart).filter(Boolean);
  return scope.length ? `bull:${scope.join(":")}` : "bull";
})();

let client;
let subscriber;

export const createSharedBullClient = (type) => {
  switch (type) {
    case 'client':
      if (!client) {
        client = new Redis(redisConfig);
        client.setMaxListeners(100);
        client.on('error', (err) => console.error('Redis Client Error', err.message));
      }
      return client;
    case 'subscriber':
      if (!subscriber) {
        subscriber = new Redis(redisConfig);
        subscriber.setMaxListeners(100);
        subscriber.on('error', (err) => console.error('Redis Subscriber Error', err.message));
      }
      return subscriber;
    case 'bclient':
      const bclient = new Redis(redisConfig);
      bclient.on('error', (err) => console.error('Redis bclient Error', err.message));
      return bclient;
    default:
      return new Redis(redisConfig);
  }
};

/**
 * The options every queue is built with, declared once so a queue cannot be
 * added later that quietly opts out of the namespace.
 */
export const bullQueueOptions = (overrides = {}) => ({
  createClient: createSharedBullClient,
  prefix: BULL_PREFIX,
  ...overrides,
});
