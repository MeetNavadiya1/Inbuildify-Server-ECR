import "dotenv/config";
import { Sequelize } from "sequelize";

import { env } from "../env.config.js";
import { createMigrationUmzug } from "./migrationRunner.js";

const sequelize = new Sequelize(env.DB.DB_NAME, env.DB.DB_USER, env.DB.DB_PASSWORD, {
  host: env.DB.DB_HOST,
  port: parseInt(env.DB.DB_PORT, 10),
  dialect: "postgres",
  logging: false,
  timezone: "+05:30",
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const umzug = createMigrationUmzug(sequelize);
const command = process.argv[2] ?? "up";

try {
  if (command === "down") {
    await umzug.down();
  } else if (command === "pending") {
    const pending = await umzug.pending();
    console.log("Pending migrations:", pending.map((m) => m.name));
  } else if (command === "executed") {
    const executed = await umzug.executed();
    console.log("Executed migrations:", executed.map((m) => m.name));
  } else {
    await umzug.up();
  }
} finally {
  await sequelize.close();
}
