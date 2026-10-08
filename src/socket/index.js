import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { SCOPES, getRoleScope } from "../constants/rbac.js";
import { BULL_PREFIX, createSharedBullClient } from "../config/redisBull.config.js";
import logger from "../utils/logger.js";
import { authenticateToken } from "./socketAuth.js";
import { joinedThreadAccess, registerChatBridge, registerChatSocket } from "./chat.socket.js";
import { presenceThreadHooks, registerPresenceBridge, registerPresenceSocket } from "./presence.socket.js";

/**
 * Socket.IO server — the real-time layer for Lead / Job chat.
 *
 * A connection carries the same access token as the REST API
 * (`io(url, { auth: { token } })`) and is authenticated the way
 * authMiddleware authenticates a request. On connect a socket joins only its
 * own user room and its tenant's room (both used for content-free "something
 * changed, refetch" hints). Every chat room holding message content has to be
 * asked for with `chat:join`, and each ask re-runs the record's access check.
 *
 * Multiple backend instances: set SOCKET_REDIS_ADAPTER=true to fan emits out
 * through Redis. The channel is namespaced like the Bull queues because the
 * Redis instance is shared between environments.
 */

let io = null;

export const getIO = () => io;

function corsOrigin() {
  const list = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : "*";
}

/** The tenant room a user's inbox hints arrive on — mirrors applyTenantScope. */
export function tenantRoomOf(user) {
  const scope = getRoleScope(user.role_name);
  if (scope === SCOPES.PLATFORM) {
    return "tenant:platform";
  }
  if (scope === SCOPES.COMPANY) {
    return `tenant:company:${user.company_id}`;
  }
  return user.builder_id ? `tenant:builder:${user.builder_id}` : `tenant:company:${user.company_id}`;
}

export function initSocket(httpServer) {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: { origin: corsOrigin(), methods: ["GET", "POST"] },
    // WebSocket only — no HTTP long-polling fallback.
    transports: ["websocket"],
    // Chat messages are small; refuse anything that is not.
    maxHttpBufferSize: 64 * 1024,
  });

  if (process.env.SOCKET_REDIS_ADAPTER === "true") {
    const pub = createSharedBullClient("default");
    const sub = createSharedBullClient("default");
    io.adapter(createAdapter(pub, sub, { key: `socket.io#${BULL_PREFIX}` }));
    logger.info("Socket.IO: Redis adapter enabled");
  }

  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.token ||
        socket.handshake.query?.token;
      const token = typeof rawToken === "string" ? rawToken.replace(/^Bearer\s+/i, "").trim() : rawToken;
      socket.data.user = await authenticateToken(token);
      socket.data.token = token;
      return next();
    } catch (error) {
      // One generic reason — the client refreshes its token and reconnects.
      const err = new Error("unauthorized");
      err.data = { reason: error?.name === "TokenExpiredError" ? "expired" : "invalid" };
      return next(err);
    }
  });

  const presence = presenceThreadHooks(io);

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.users_id}`);
    if (user.role_name !== "Contact") {
      socket.join(tenantRoomOf(user));
    }
    registerChatSocket(io, socket, presence);
    registerPresenceSocket(io, socket, joinedThreadAccess);
  });

  registerChatBridge(io);
  registerPresenceBridge(io);

  logger.info("Socket.IO server attached");
  return io;
}

export default initSocket;
