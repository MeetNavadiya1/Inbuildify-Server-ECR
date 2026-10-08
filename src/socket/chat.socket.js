import { keysToCamelCase } from "../utils/common.js";
import chatEvents, { CHAT_EVENT } from "../modules/chat/chat.events.js";
import chatService, { CHAT_ENTITY, entityContacts, resolveChatAccess } from "../modules/chat/chat.service.js";
import { authenticateToken, withUserContext } from "./socketAuth.js";

/**
 * Chat over Socket.IO.
 *
 * Client → server
 *   chat:join  { entityType: "lead"|"job", entityId }  ack { ok, status? }
 *   chat:leave { entityType, entityId }
 *   chat:send  { entityType, entityId, body }  ack { ok, message } | { ok: false, status, message }
 *   chat:read  { entityType, entityId }        ack { ok, unreadCount } | { ok: false, status }
 *   chat:presence — see presence.socket.js
 *
 * Server → client
 *   chat:message  { entityType, entityId, conversationId, message }   thread room
 *   chat:read     { entityType, entityId, userId, participantType, lastReadAt }
 *                                                                     thread room
 *   chat:activity {}   user / tenant rooms — no content, just "refetch your
 *                      inbox or badge through the REST API", which applies
 *                      the full access check. Nothing about a record is ever
 *                      pushed to someone who has not passed that check.
 *
 * Text messages and read marks go over the socket and call the same service
 * functions as the REST routes, so validation and authorization still live in
 * chat.service.js. Messages with attachments stay on REST (multipart → S3).
 * Either way the service publishes to chat.events after each commit and the
 * bridge below fans it out.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROOMS_PER_SOCKET = 50;

// Same budget as the REST send route (30/min per thread), keyed by user rather
// than IP: a builder answering many customers at once is not throttled by the
// total, only by flooding a single thread.
const SEND_WINDOW_MS = 60_000;
const SEND_MAX = 30;
const sendBuckets = new Map();

/** Seconds until this user may send to the thread again; 0 when allowed now. */
function sendWaitSeconds(userId, thread) {
  const key = `${userId}:${thread.type}:${thread.id}`;
  const now = Date.now();
  let bucket = sendBuckets.get(key);
  if (!bucket || now - bucket.start > SEND_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    sendBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count <= SEND_MAX) {
    return 0;
  }
  return Math.max(1, Math.ceil((bucket.start + SEND_WINDOW_MS - now) / 1000));
}

/** "45 seconds", "1 minute", "2 min 5 sec". */
function formatWait(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (!sec) {
    return `${min} minute${min === 1 ? "" : "s"}`;
  }
  return `${min} min ${sec} sec`;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of sendBuckets) {
    if (now - b.start > SEND_WINDOW_MS) {
      sendBuckets.delete(k);
    }
  }
}, 5 * 60_000).unref();

/** Service errors → an ack body. 5xx details stay in the log. */
function errorAck(error, fallback) {
  const status = Number(error?.status ?? error?.statusCode) || 500;
  if (status >= 500) {
    console.error(`chat socket: ${fallback}`, error);
  }
  return { ok: false, status, message: status < 500 && error?.message ? error.message : fallback };
}

export const threadRoom = (entityType, entityId) => `chat:${entityType}:${String(entityId).toLowerCase()}`;

/**
 * Every room showing this build's thread: a lead and the job it became share
 * one conversation, so a message sent from either record reaches viewers of
 * both. Each room is addressed with its own entity so the client matches it to
 * the thread it has open.
 */
export function threadTargets(access) {
  const targets = [];
  if (access.leadsId) {
    targets.push({ entityType: CHAT_ENTITY.LEAD, entityId: access.leadsId });
  }
  const jobId = access.jobId || access.linkedJobId;
  if (jobId) {
    targets.push({ entityType: CHAT_ENTITY.JOB, entityId: jobId });
  }
  return targets;
}

function parseThread(payload) {
  const type = String(payload?.entityType || "").toUpperCase();
  const id = String(payload?.entityId || "");
  if (!Object.values(CHAT_ENTITY).includes(type) || !UUID_RE.test(id)) {
    return null;
  }
  return { type, id };
}

const reply = (ack, body) => {
  if (typeof ack === "function") {
    ack(body);
  }
};

/**
 * `presence` ({ joined, left }) is told as the socket enters and leaves a
 * thread — having a lead or job open is what shows staff online on it.
 */
export function registerChatSocket(io, socket, presence) {
  socket.on("chat:join", async (payload, ack) => {
    const thread = parseThread(payload);
    if (!thread) {
      return reply(ack, { ok: false, status: 422 });
    }
    const joined = [...socket.rooms].filter((r) => r.startsWith("chat:")).length;
    if (joined >= MAX_ROOMS_PER_SOCKET) {
      return reply(ack, { ok: false, status: 429 });
    }

    try {
      // Re-check the token on every join: a logout or deactivation since the
      // socket connected must stop it reaching new threads.
      const user = await authenticateToken(socket.data.token);
      socket.data.user = user;
      const access = await withUserContext(user, () => resolveChatAccess(thread.type, thread.id, user));
      const room = threadRoom(thread.type, thread.id);
      socket.join(room);
      // Kept for lookups scoped to a joined thread (presence), so they need no
      // second access check.
      socket.data.threadAccess ??= new Map();
      socket.data.threadAccess.set(room, access);
      presence?.joined(socket, room);
      return reply(ack, { ok: true });
    } catch (error) {
      const status = Number(error?.status ?? error?.statusCode) || 401;
      return reply(ack, { ok: false, status });
    }
  });

  socket.on("chat:send", async (payload, ack) => {
    const thread = parseThread(payload);
    if (!thread) {
      return reply(ack, { ok: false, status: 422, message: "Invalid thread." });
    }
    if (typeof payload.body !== "string") {
      return reply(ack, { ok: false, status: 422, message: "Message cannot be empty." });
    }
    try {
      // Re-checked per message, as authMiddleware does per request.
      const user = await authenticateToken(socket.data.token);
      socket.data.user = user;
      const retryAfterSeconds = sendWaitSeconds(user.users_id, thread);
      if (retryAfterSeconds) {
        return reply(ack, {
          ok: false,
          status: 429,
          retryAfterSeconds,
          message: `You are sending messages too quickly. You can send again in ${formatWait(retryAfterSeconds)}.`,
        });
      }
      const message = await withUserContext(user, () =>
        chatService.sendMessage(thread.type, thread.id, payload.body, user),
      );
      return reply(ack, { ok: true, message: keysToCamelCase(message) });
    } catch (error) {
      return reply(ack, errorAck(error, "Failed to send message."));
    }
  });

  socket.on("chat:read", async (payload, ack) => {
    const thread = parseThread(payload);
    if (!thread) {
      return reply(ack, { ok: false, status: 422 });
    }
    try {
      const user = await authenticateToken(socket.data.token);
      socket.data.user = user;
      const data = await withUserContext(user, () => chatService.markRead(thread.type, thread.id, user));
      return reply(ack, { ok: true, unreadCount: data.unread_count ?? 0 });
    } catch (error) {
      return reply(ack, errorAck(error, "Failed to mark conversation as read."));
    }
  });

  socket.on("chat:leave", (payload) => {
    const thread = parseThread(payload);
    if (thread) {
      const room = threadRoom(thread.type, thread.id);
      socket.leave(room);
      presence?.left(socket, room, socket.data.threadAccess?.get(room));
      socket.data.threadAccess?.delete(room);
    }
  });
}

/** The access resolved when this socket joined the thread, or null if it has not. */
export function joinedThreadAccess(socket, payload) {
  const thread = parseThread(payload);
  if (!thread) {
    return null;
  }
  const room = threadRoom(thread.type, thread.id);
  return socket.rooms.has(room) ? socket.data.threadAccess?.get(room) || null : null;
}

/** Rooms that should refetch their inbox after activity on this record. */
async function activityRooms(access) {
  const rooms = new Set(["tenant:platform"]);
  if (access.companyId) {
    rooms.add(`tenant:company:${access.companyId}`);
  }
  if (access.builderId) {
    rooms.add(`tenant:builder:${access.builderId}`);
  }
  const contacts = await entityContacts(access);
  contacts.forEach((c) => rooms.add(`user:${c.user_id}`));
  return [...rooms];
}

let bridged = false;

/** Turns committed chat writes into socket emits. Registered once per process. */
export function registerChatBridge(io) {
  if (bridged) {
    return;
  }
  bridged = true;

  chatEvents.on(CHAT_EVENT.MESSAGE, async ({ access, conversationId, message }) => {
    try {
      const camel = keysToCamelCase(message);
      for (const { entityType, entityId } of threadTargets(access)) {
        io.to(threadRoom(entityType, entityId)).emit("chat:message", {
          entityType: entityType.toLowerCase(),
          entityId,
          conversationId,
          message: camel,
        });
      }
      io.to(await activityRooms(access)).emit("chat:activity", {});
    } catch (error) {
      console.error("chat socket: message emit failed:", error);
    }
  });

  chatEvents.on(CHAT_EVENT.READ, ({ access, userId, participantType, lastReadAt }) => {
    try {
      for (const { entityType, entityId } of threadTargets(access)) {
        io.to(threadRoom(entityType, entityId)).emit("chat:read", {
          entityType: entityType.toLowerCase(),
          entityId,
          userId,
          participantType,
          lastReadAt: lastReadAt instanceof Date ? lastReadAt.toISOString() : lastReadAt,
        });
      }
      // The reader's other tabs/devices refresh their badges.
      io.to(`user:${userId}`).emit("chat:activity", {});
    } catch (error) {
      console.error("chat socket: read emit failed:", error);
    }
  });
}
