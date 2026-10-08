import { env } from "./env.config.js";

const isSsl = env.NODE_ENV === "production";

// Auto-construct DATABASE_URL from individual DB_* variables
// so the user only needs to change DB_NAME in .env
const connectionString = `postgresql://${env.DB.DB_USER}:${env.DB.DB_PASSWORD}@${env.DB.DB_HOST}:${env.DB.DB_PORT}/${env.DB.DB_NAME}`;

const pgConfig = {
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false, sslmode: "require" } : false,
  max: 10000,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 0,
  maxUses: 10000,
  waitForConnections: true,
  queueLimit: 0,
};

export default pgConfig;
