import { Pool } from "pg";

import pgConfig from "../config/pg.js";

let poolClient;

const getPool = () => {
  if (!poolClient) {
    try {
      poolClient = new Pool(pgConfig);

      // Test the connection
      poolClient.query("SELECT 1", (err) => {
        if (err) {
          console.error("Database connection error:", err);
        } else {
          console.log("Database connected successfully pg ");
        }
      });

      // Handle pool errors
      poolClient.on("error", (err) => {
        console.error("Unexpected error on idle client", err);
      });

      // Handle pool connection errors
      poolClient.on("connect", (client) => {
        client.on("error", (err) => {
          console.error("Error on client connection:", err);
        });
      });

      // Monitor pool size
      setInterval(() => {
        if (poolClient) {
          const poolStatus = poolClient.totalCount;
          const idleCount = poolClient.idleCount;
          console.log(
            `Pool Status - Total: ${poolStatus}, Idle: ${idleCount}, Active: ${poolStatus - idleCount
            }`,
          );

          // Alert if pool is near capacity
          if (poolStatus >= pgConfig.max * 0.9) {
            console.warn(
              "WARNING: Database connection pool is near capacity!",
              {
                totalConnections: poolStatus,
                maxConnections: pgConfig.max,
                idleConnections: idleCount,
                activeConnections: poolStatus - idleCount,
              },
            );
          }
        }
      }, 30000); // Check every 30 seconds

      // Close pool on process termination
      process.on("exit", () => {
        poolClient.end(() => {
          console.log("Pool has ended");
        });
      });

      // Handle uncaught exceptions
      process.on("uncaughtException", (err) => {
        console.error("Uncaught Exception:", err);
        if (poolClient) {
          poolClient.end(() => {
            console.log("Pool closed due to uncaught exception");
            process.exit(1);
          });
        }
      });
    } catch (error) {
      console.error("Error creating database pool:", error);
      throw error; // Rethrow to prevent application from starting with invalid pool
    }
  }
  return poolClient;
};

export default getPool;
