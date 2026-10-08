import { env } from "./env.config.js";

export default {
  development: {
    username: env.DB.DB_USER,
    password: env.DB.DB_PASSWORD,
    database: env.DB.DB_NAME,
    host: env.DB.DB_HOST,
    dialect: "postgres",
  },
};
