import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runSeeder = (file) => {
  return new Promise((resolve, reject) => {
    const seederPath = path.join(__dirname, file);
    console.log(`🚀 Running ${file}...`);

    const seeder = spawn("node", [seederPath], { stdio: "inherit" });

    seeder.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ ${file} completed successfully.`);
        resolve();
      } else {
        console.error(`❌ ${file} failed with exit code ${code}`);
        reject(new Error(`${file} failed`));
      }
    });
  });
};

const runAllSeeders = async () => {
  const files = fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith(".js") && file !== "seedAll.js");

  console.log(`📂 Found ${files.length} seeder(s):`, files);

  for (const file of files) {
    await runSeeder(file);
  }

  console.log("🌱 All seeders executed successfully.");
};

runAllSeeders().catch((err) => {
  console.error("❌ Seeding process failed:", err);
  process.exit(1);
});
