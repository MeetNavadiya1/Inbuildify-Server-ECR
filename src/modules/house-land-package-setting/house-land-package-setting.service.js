import db from "../../config/database/models/postgre-models/index.js";

export async function getHouseLandPackageSettingService({ companyId, builderId }) {
  // ── Fetch house land package settings ─────────────────────────────────────
  const existing = await db.HouseLandPackageSettings.findOne({
    where: {
      company_id: companyId,
      builder_id: builderId,
    },
  });

  if (!existing) {
    return null;
  }

  return existing.toJSON();
}

export async function getHouseLandPackageSettingsService({ company_id, builder_id, user_id }) {
  // ── 1. Find existing settings ─────────────────────────────────────────────
  const existing = await db.HouseLandPackageSettings.findOne({
    where: { company_id, builder_id },
    order: [["created_at", "DESC"]],
  });

  if (existing) {
    return existing.toJSON();
  }

  // ── 2. Auto-create with defaults if not found ─────────────────────────────
  const created = await db.HouseLandPackageSettings.create({
    company_id,
    builder_id,
    include_facade_cost_in_total: false,
    created_by: user_id,
    updated_by: user_id,
  });

  return created.toJSON();
}

export async function updateHouseLandPackageSettingService({
  id,
  builderId,
  userId,
  include_facade_cost_in_total,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists for this builder ───────────────────────────────
    const existing = await db.HouseLandPackageSettings.findOne({
      where: {
        house_land_package_settings_id: id,
        builder_id: builderId,
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("House land package setting not found for this builder.");
      error.status = 404;
      throw error;
    }

    // ── 2. Update record ──────────────────────────────────────────────────────
    await existing.update(
      {
        include_facade_cost_in_total,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return existing.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
