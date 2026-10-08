import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Sequelize } from "sequelize";
import { Umzug, SequelizeStorage } from "umzug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

export function createMigrationUmzug(sequelize) {
  return new Umzug({
    migrations: {
      glob: ["*.js", { cwd: migrationsDir }],
      resolve: ({ name, path: migrationPath, context }) => ({
        name,
        up: async () => {
          const mod = await import(pathToFileURL(migrationPath).href);
          const migration = mod.default ?? { up: mod.up, down: mod.down };
          await migration.up(context, Sequelize);
        },
        down: async () => {
          const mod = await import(pathToFileURL(migrationPath).href);
          const migration = mod.default ?? { up: mod.up, down: mod.down };
          await migration.down(context, Sequelize);
        },
      }),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

export async function runPendingMigrations(sequelize) {
  const umzug = createMigrationUmzug(sequelize);
  await umzug.up();
}
