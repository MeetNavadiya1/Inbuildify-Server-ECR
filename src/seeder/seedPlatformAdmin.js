import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { env } from "../config/env.config.js";
import { hashAdminPassword } from "../modules/admin/auth/admin-auth.service.js";
import { ALL_ADMIN_PERMISSIONS } from "../middleware/adminPermissionMiddleware.js";

const PLATFORM_ROLES = [
  {
    name: "Super Admin",
    scope: "Full platform access",
    description: "Every admin capability.",
    permissions: ["*"],
    is_system: true,
  },
  {
    name: "Read Only",
    scope: "View only",
    description: "Can view every admin screen but change nothing.",
    permissions: ALL_ADMIN_PERMISSIONS,
    is_system: true,
  },
];

export const seedPlatformAdmin = async () => {
  await initModels();

  const { PlatformRole, PlatformUser } = db;

  for (const role of PLATFORM_ROLES) {
    const [row, created] = await PlatformRole.findOrCreate({
      where: { name: role.name },
      defaults: role,
    });
    if (!created) {
      await row.update({
        scope: role.scope,
        description: role.description,
        permissions: role.permissions,
        is_system: role.is_system,
      });
      console.log(`ℹ️  Platform role updated: ${role.name}`);
    } else {
      console.log(`✅ Platform role created: ${role.name}`);
    }
  }

  await PlatformRole.destroy({ where: { name: ["Support", "Billing"] } });

  const explicitPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!explicitPassword && env.NODE_ENV === "production") {
    console.log("⏭️  Skipping platform admin user: set PLATFORM_ADMIN_PASSWORD to seed one in production.");
    return;
  }

  const email = (process.env.PLATFORM_ADMIN_EMAIL || "admin@inbuildify.com").toLowerCase();
  const password = explicitPassword || "Admin@12345";

  const superRole = await PlatformRole.findOne({ where: { name: "Super Admin" } });

  const existing = await PlatformUser.findOne({ where: { email } });
  if (existing) {
    console.log(`ℹ️  Platform admin already exists: ${email}`);
    return;
  }

  await PlatformUser.create({
    name: process.env.PLATFORM_ADMIN_NAME || "Platform Admin",
    email,
    password: await hashAdminPassword(password),
    platform_role_id: superRole?.platform_role_id || null,
    is_active: true,
  });

  console.log(`✅ Platform admin created: ${email} / ${password}`);
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  seedPlatformAdmin()
    .catch((err) => console.error("❌ Platform admin seeding failed:", err))
    .finally(async () => {
      if (db.sequelize) await db.sequelize.close();
      process.exit(0);
    });
}

export default { seedPlatformAdmin };
