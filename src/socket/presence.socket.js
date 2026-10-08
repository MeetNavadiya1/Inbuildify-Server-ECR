import { BULL_PREFIX, createSharedBullClient } from "../config/redisBull.config.js";
import { ROLES } from "../constants/rbac.js";
import chatEvents, { CHAT_EVENT } from "../modules/chat/chat.events.js";
import { PARTICIPANT_TYPE, entityContacts } from "../modules/chat/chat.service.js";
import { threadRoom, threadTargets } from "./chat.socket.js";
import { withUserContext } from "./socketAuth.js";

/**
 * Online / offline presence for chat.
 *
 * Contacts: a contact is online while at least one of their sockets is
 * connected — counted through their `user:<id>` room, so it holds across
 * instances when the Redis adapter is on.
 *
 * The builder (as a contact sees it) is online only while someone on the
 * record's builder or company team is actually looking at chat:
 *   - has this build's lead or job page open (its thread is joined), which
 *     shows them online to this build's customers only, or
 *   - has the Messages inbox open, which shows them online to every customer
 *     of their builder / company.
 * Staff sockets mark this through rooms of their own, which contacts never
 * join:
 *   watch:<thread room>       joined alongside the thread (see chat.socket.js)
 *   inbox:tenant:builder:<id> / inbox:tenant:company:<id>  while the inbox is open
 *
 * "Last seen" is written to Redis when someone leaves (a contact's last socket
 * drops; a staff member leaves a thread or the inbox), so it survives restarts
 * and is shared between instances.
 *
 * Client → server
 *   chat:presence { entityType, entityId }
 *     ack { ok, contacts: [{ userId, online, lastSeenAt }] }   staff viewer
 *     ack { ok, builder: { online, lastSeenAt } }              contact viewer
 *   chat:inbox-open / chat:inbox-close   staff only — the Messages page
 *
 * Server → client
 *   chat:presence          { userId, online, lastSeenAt }  tenant rooms — a
 *                          contact came online or went offline
 *   chat:builder-presence  {}  presence watch rooms (contacts only) — the
 *                          builder's presence on a thread may have changed;
 *                          ask again with chat:presence
 */

const LAST_SEEN_KEY = `${BULL_PREFIX}:presence:last-seen`;
/** A page reload drops and reopens the socket; don't flash "offline" for it. */
const OFFLINE_GRACE_MS = 5000;

const redis = () => createSharedBullClient("client");

const isContact = (user) => user?.role_name === ROLES.CONTACT;

/** Tenant keys of the staff who stand for "the builder" on a record. */
function builderTenantsOf(access) {
  const keys = [];
  if (access.builderId) {
    keys.push(`tenant:builder:${access.builderId}`);
  }
  if (access.companyId) {
    keys.push(`tenant:company:${access.companyId}`);
  }
  return keys;
}

/** Staff rooms that may see this contact's records. */
function contactWatcherRooms(user) {
  const rooms = ["tenant:platform"];
  if (user.company_id) {
    rooms.push(`tenant:company:${user.company_id}`);
  }
  if (user.builder_id) {
    rooms.push(`tenant:builder:${user.builder_id}`);
  }
  return rooms;
}

/** The tenant keys a staff member counts towards. */
function staffTenantKeys(user) {
  const keys = [];
  if (user.builder_id) {
    keys.push(`tenant:builder:${user.builder_id}`);
  }
  if (user.company_id) {
    keys.push(`tenant:company:${user.company_id}`);
  }
  return keys;
}

/** Every room of this build's thread (a lead and its job share one). */
const threadRoomsOf = (access) => threadTargets(access).map((t) => threadRoom(t.entityType, t.entityId));

const watchRoom = (room) => `watch:${room}`;
const inboxRoom = (tenantKey) => `inbox:${tenantKey}`;
/** Contacts listen here for "the builder's presence changed". */
const presenceRoom = (room) => `presence:${room}`;

async function hasSockets(io, rooms) {
  if (!rooms.length) {
    return false;
  }
  const sockets = await io.in(rooms).fetchSockets();
  return sockets.length > 0;
}

async function readLastSeen(keys) {
  if (!keys.length) {
    return [];
  }
  try {
    return await redis().hmget(LAST_SEEN_KEY, ...keys);
  } catch {
    return keys.map(() => null);
  }
}

async function writeLastSeen(keys, iso) {
  if (!keys.length) {
    return;
  }
  try {
    await redis().hset(LAST_SEEN_KEY, Object.fromEntries(keys.map((k) => [k, iso])));
  } catch {
    // Presence is best-effort; last seen just stays at its previous value.
  }
}

const latest = (values) =>
  values.filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

async function contactPresence(io, userId) {
  const [online, [lastSeenAt]] = await Promise.all([
    hasSockets(io, [`user:${userId}`]),
    readLastSeen([`user:${userId}`]),
  ]);
  return { userId, online, lastSeenAt: lastSeenAt || null };
}

/** Rooms whose sockets make the builder online on this thread. */
function builderRoomsOn(access) {
  return [...threadRoomsOf(access).map(watchRoom), ...builderTenantsOf(access).map(inboxRoom)];
}

async function builderPresence(io, access) {
  const rooms = builderRoomsOn(access);
  const [online, lastSeen] = await Promise.all([hasSockets(io, rooms), readLastSeen(rooms)]);
  return { online, lastSeenAt: latest(lastSeen) };
}

/** Tell staff that a contact's presence may have changed. */
async function announceContact(io, user) {
  const presence = await contactPresence(io, user.users_id);
  io.to(contactWatcherRooms(user)).emit("chat:presence", presence);
}

let bridged = false;

/**
 * A contact sending a message is activity too, even with no socket open (the
 * REST API, another client): move their last seen up to it and tell staff.
 * Registered once per process.
 */
export function registerPresenceBridge(io) {
  if (bridged) {
    return;
  }
  bridged = true;

  chatEvents.on(CHAT_EVENT.MESSAGE, async ({ access, message }) => {
    if (message?.sender_type !== PARTICIPANT_TYPE.CONTACT || !message.sender_id) {
      return;
    }
    try {
      const userId = message.sender_id;
      const at = new Date(message.created_at || Date.now()).toISOString();
      await writeLastSeen([`user:${userId}`], at);
      // The sender has no user row here; the record's tenants are the staff who can see it.
      const presence = await contactPresence(io, userId);
      io.to(["tenant:platform", ...builderTenantsOf(access)]).emit("chat:presence", presence);
    } catch (error) {
      console.error("presence: message activity update failed:", error);
    }
  });
}

/** Tell contacts watching these rooms to ask for the builder's presence again. */
function announceBuilder(io, rooms) {
  if (rooms.length) {
    io.to(rooms.map(presenceRoom)).emit("chat:builder-presence", {});
  }
}

/**
 * A staff member left builder-presence rooms (`watch:` / `inbox:`): record when,
 * and let the contacts on them ask again.
 */
async function leftBuilderRooms(io, rooms, iso = new Date().toISOString()) {
  if (!rooms.length) {
    return;
  }
  await writeLastSeen(rooms, iso);
  announceBuilder(io, rooms);
}

/**
 * Hooks chat.socket.js calls as a staff socket joins or leaves a thread, so
 * having a lead or job open counts as being online for that build.
 */
export function presenceThreadHooks(io) {
  return {
    joined(socket, room) {
      if (isContact(socket.data.user)) {
        return;
      }
      const watch = watchRoom(room);
      if (!socket.rooms.has(watch)) {
        socket.join(watch);
        announceBuilder(io, [watch]);
      }
    },
    left(socket, room, access) {
      if (isContact(socket.data.user)) {
        // Stop the "builder presence changed" pings for this build's thread.
        if (access) {
          threadRoomsOf(access).forEach((r) => socket.leave(presenceRoom(watchRoom(r))));
        }
        return;
      }
      const watch = watchRoom(room);
      if (socket.rooms.has(watch)) {
        socket.leave(watch);
        leftBuilderRooms(io, [watch]).catch((error) => console.error("presence: leave update failed:", error));
      }
    },
  };
}

export function registerPresenceSocket(io, socket, threadAccessOf) {
  const user = socket.data.user;

  if (isContact(user)) {
    announceContact(io, user).catch((error) => console.error("presence: announce failed:", error));
  }

  socket.on("chat:inbox-open", () => {
    if (isContact(socket.data.user)) {
      return;
    }
    const rooms = staffTenantKeys(socket.data.user)
      .map(inboxRoom)
      .filter((r) => !socket.rooms.has(r));
    if (rooms.length) {
      socket.join(rooms);
      announceBuilder(io, rooms);
    }
  });

  socket.on("chat:inbox-close", () => {
    const rooms = [...socket.rooms].filter((r) => r.startsWith("inbox:"));
    rooms.forEach((r) => socket.leave(r));
    leftBuilderRooms(io, rooms).catch((error) => console.error("presence: inbox close failed:", error));
  });

  // `disconnect` fires after the socket has left its rooms, so note them here.
  let builderRooms = [];
  socket.on("disconnecting", () => {
    builderRooms = [...socket.rooms].filter((r) => r.startsWith("watch:") || r.startsWith("inbox:"));
  });

  socket.on("disconnect", () => {
    const at = new Date().toISOString();
    setTimeout(async () => {
      try {
        if (isContact(user)) {
          // Still connected elsewhere (another tab, or this one reconnected).
          if (await hasSockets(io, [`user:${user.users_id}`])) {
            return;
          }
          await writeLastSeen([`user:${user.users_id}`], at);
          await announceContact(io, user);
          return;
        }
        // A reload rejoins its rooms within the grace period; contacts that
        // ask again then still see the builder online.
        await leftBuilderRooms(io, builderRooms, at);
      } catch (error) {
        console.error("presence: disconnect update failed:", error);
      }
    }, OFFLINE_GRACE_MS);
  });

  socket.on("chat:presence", async (payload, ack) => {
    const reply = (body) => typeof ack === "function" && ack(body);
    const access = threadAccessOf(socket, payload);
    if (!access) {
      return reply({ ok: false, status: 404 });
    }
    try {
      if (isContact(socket.data.user)) {
        socket.join(builderRoomsOn(access).map(presenceRoom));
        return reply({ ok: true, builder: await builderPresence(io, access) });
      }
      const contacts = await withUserContext(socket.data.user, () => entityContacts(access));
      const presence = await Promise.all(contacts.map((c) => contactPresence(io, c.user_id)));
      return reply({ ok: true, contacts: presence });
    } catch (error) {
      console.error("presence: lookup failed:", error);
      return reply({ ok: false, status: 500 });
    }
  });
}
