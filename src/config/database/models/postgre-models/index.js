import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

import { Sequelize } from "sequelize";

import { env } from "../../../env.config.js";
import { wireSampleDataFlag } from "./sampleDataFlag.js";
import { wireAddressPhoneGuard, wireLocationGuard, wireTimezoneGuard } from "./locationGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(__dirname);
const DB_NAME = env.DB.DB_NAME;
const DB_PORT = parseInt(env.DB.DB_PORT);
const DB_USER = env.DB.DB_USER;
const DB_PASSWORD = env.DB.DB_PASSWORD;
const DB_HOST = env.DB.DB_HOST;

const isProduction = env.NODE_ENV === "production";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "postgres",
  logging: false,
  timezone: "+05:30",
  pool: {
    max: 20,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  } : {},
});

const db = {
  sequelize,
  Sequelize,
};

export const initModels = async () => {
  const allFiles = fs.readdirSync(__dirname);

  const files = allFiles.filter((file) => file.endsWith(".model.js"));

  // STEP 1: Load and initialize ALL models first (Parallelized)
  await Promise.all(
    files.map(async (file) => {
      try {
        const fileUrl = pathToFileURL(path.join(__dirname, file)).href;
        const modelModule = await import(fileUrl);
        const modelFactory = modelModule.default;

        if (typeof modelFactory !== "function") {
          return;
        }

        const model = modelFactory(sequelize);

        if (!model || !model.name) {
          return;
        }

        db[model.name] = model;
      } catch (error) {
        console.error(`Error loading model ${file}:`, error.stack);
      }
    })
  );

  // STEP 2: Run associations AFTER all models are loaded
  Object.keys(db).forEach((modelName) => {
    if (modelName === "sequelize" || modelName === "Sequelize") {
      return;
    }
    const model = db[modelName];
    if (typeof model.associate === "function") {
      try {
        model.associate(db);
      } catch (error) {
        console.error(` Error associating ${modelName}:`, error.message);
      }
    }
  });

  // STEP 3: Make the sample-data marker survive to the client on every model
  // that carries it, so the UI can badge demo rows and leave them out of the
  // pickers on a "create new" form.
  wireSampleDataFlag(db);

  // STEP 4: Refuse a state outside its country, or (for India) a city outside
  // its state, on every model that stores a location.
  wireLocationGuard(db);
  // …and a company's timezone outside its address country.
  wireTimezoneGuard(db);
  // …and, for India, an invalid phone on a user or builder (located via their address).
  wireAddressPhoneGuard(db);

  console.log(`\n Total models registered: ${Object.keys(db).length - 2}`);

};
db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
