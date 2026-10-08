import db from "../../config/database/models/postgre-models/index.js";

export async function createConstructionOptionService({
  builderId,
  companyId,
  userId,
  option_name,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check duplicate option for this company and builder ────────────────
    const existing = await db.ConstructionOption.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        option_name: option_name.trim(),
      },
      attributes: ["construction_option_id"],
      transaction,
    });

    if (existing) {
      const error = new Error("Construction option already exists for this company and builder.");
      error.status = 400;
      throw error;
    }

    // ── 2. Insert new construction option ─────────────────────────────────────
    const newOption = await db.ConstructionOption.create(
      {
        company_id: companyId,
        builder_id: builderId,
        option_name: option_name.trim(),
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return newOption.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllConstructionOptionsService({ builderId, companyId }) {
  // ── Fetch all construction options for this company and builder ───────────
  const options = await db.ConstructionOption.findAll({
    where: {
      company_id: companyId,
      builder_id: builderId,
    },
    order: [["created_at", "DESC"]],
  });

  return options.map((option) => option.toJSON());
}

export async function updateConstructionOptionService({
  id,
  builderId,
  companyId,
  userId,
  option_name,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists and belongs to this builder/company ────────────
    const existing = await db.ConstructionOption.findOne({
      where: {
        construction_option_id: id,
        company_id: companyId,
        builder_id: builderId,
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("Record not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    // ── 2. Check duplicate option_name (excluding current record) ─────────────
    const duplicate = await db.ConstructionOption.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        option_name: option_name.trim(),
        construction_option_id: { [db.Sequelize.Op.ne]: id },
      },
      attributes: ["construction_option_id"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Construction option already exists with this option name.");
      error.status = 409;
      throw error;
    }

    // ── 3. Perform update ─────────────────────────────────────────────────────
    await existing.update(
      {
        option_name: option_name.trim(),
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

export async function deleteConstructionOptionService({ id, builderId, companyId }) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists and belongs to this builder/company ────────────
    const existing = await db.ConstructionOption.findOne({
      where: {
        construction_option_id: id,
        company_id: companyId,
        builder_id: builderId,
      },
      attributes: ["construction_option_id"],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction option not found or access denied.");
      error.status = 404;
      throw error;
    }

    // ── 2. Remove id from construction_option_id array in construction_checklist
    // Sequelize has no native array_remove — using sequelize.fn for this raw operation
    await db.ConstructionChecklist.update(
      {
        construction_option_id: db.sequelize.fn(
          "array_remove",
          db.sequelize.col("construction_option_id"),
          id,
        ),
      },
      {
        where: {
          [db.Sequelize.Op.and]: [
            db.sequelize.literal(`'${id}' = ANY(construction_option_id)`),
            {
              [db.Sequelize.Op.or]: [
                { company_id: companyId },
                { builder_id: builderId },
              ],
            },
          ],
        },
        transaction,
      },
    );

    // ── 3. Delete the construction option ─────────────────────────────────────
    await existing.destroy({ transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
