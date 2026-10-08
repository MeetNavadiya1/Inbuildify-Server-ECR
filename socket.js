import "./src/utils/overrideConsole.js";
import { createServer } from "node:http";
import { connectPostgre } from "./src/config/postgre.connect.js";
import logger from "./src/utils/logger.js";
import { initSocket, getIO } from "./src/socket/index.js";

const SOCKET_PORT = Number(process.env.SOCKET_PORT) || 5002;

/**
 * Dedicated Socket.IO Server Process.
 * Runs independently from the REST API server and Queue Worker.
 */
const server = createServer((req, res) => {
  // Simple health check endpoint for monitoring/tunnels
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "socket-server", port: SOCKET_PORT }));
  }

  res.writeHead(426, { "Content-Type": "text/plain" });
  res.end("WebSocket only — connect via Socket.IO client");
});

connectPostgre()
  .then(() => {
    initSocket(server);

    server.listen(SOCKET_PORT, () => {
      logger.info(`⚡ Socket.IO dedicated server running on PORT ${SOCKET_PORT}...`);
    });

    server.on("error", (error) => {
      console.error(`Critical: could not bind socket port ${SOCKET_PORT}.`, error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("Critical: Could not connect to database for socket server:", error);
    process.exit(1);
  });

const cleanupAndExit = async (err) => {
  if (err) {
    console.error("Socket Server: Unhandled error, shutting down:", err);
  }
  console.log("Socket Server: Gracefully closing connections...");
  try {
    const io = getIO();
    if (io) {
      await io.close();
    }
    server.close();
    console.log("Socket Server: Closed cleanly.");
  } catch (error) {
    console.error("Socket Server: Error during cleanup:", error);
  }
  process.exit(err ? 1 : 0);
};

process.on("SIGINT", () => cleanupAndExit());
process.on("SIGTERM", () => cleanupAndExit());
process.on("SIGUSR2", () => cleanupAndExit());
process.on("uncaughtException", (err) => cleanupAndExit(err));
process.on("unhandledRejection", (reason) => cleanupAndExit(reason));
