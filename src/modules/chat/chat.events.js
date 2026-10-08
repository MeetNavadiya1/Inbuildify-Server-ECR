import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { BULL_PREFIX, createSharedBullClient } from "../../config/redisBull.config.js";

/**
 * Bus between the chat service and the real-time transport.
 * Supports both single-process EventEmitter and multi-process Redis Pub/Sub.
 *
 * The API (server.js) and Socket.IO (socket.js) run as separate processes, so
 * a message sent over REST — every attachment is — only reaches the sockets
 * through Redis. Without SOCKET_REDIS_ADAPTER=true it is never pushed, and the
 * other side sees it only after a reload.
 */
const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(50);

export const CHAT_EVENT = Object.freeze({
  MESSAGE: "message",
  READ: "read",
});

const REDIS_CHANNEL = `chat:events#${BULL_PREFIX}`;
// Every event is already emitted locally when published; this lets the
// subscriber skip its own process's copy coming back from Redis, which would
// otherwise broadcast it twice.
const ORIGIN = randomUUID();
let redisSubInitialized = false;

function initRedisChatSubscriber() {
  if (redisSubInitialized || process.env.SOCKET_REDIS_ADAPTER !== "true") {
    return;
  }
  try {
    const sub = createSharedBullClient("subscriber");
    sub.subscribe(REDIS_CHANNEL, (err) => {
      if (err) console.error("Chat Redis sub error:", err);
    });
    sub.on("message", (channel, message) => {
      if (channel === REDIS_CHANNEL) {
        try {
          const { origin, type, payload } = JSON.parse(message);
          if (origin !== ORIGIN) {
            chatEvents.emit(type, payload);
          }
        } catch (e) {
          console.error("Chat Redis event parse error:", e);
        }
      }
    });
    redisSubInitialized = true;
  } catch (err) {
    console.error("Chat Redis sub init failed:", err);
  }
}

initRedisChatSubscriber();

/** Never let a transport failure reach the request that caused the event. */
export function publishChatEvent(type, payload) {
  try {
    chatEvents.emit(type, payload);
    if (process.env.SOCKET_REDIS_ADAPTER === "true") {
      const pub = createSharedBullClient("client");
      pub.publish(REDIS_CHANNEL, JSON.stringify({ origin: ORIGIN, type, payload })).catch((err) =>
        console.error(`chat event "${type}" Redis publish failed:`, err.message),
      );
    }
  } catch (error) {
    console.error(`chat event "${type}" listener failed:`, error);
  }
}

export default chatEvents;
