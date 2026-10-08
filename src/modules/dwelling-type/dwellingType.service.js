import { Op, literal } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { adoptSampleRow, isSampleRow } from "../../helper/sampleDataAdoption.helper.js";

// GET ALL
export async function getAllDwellingTypesService(builderId) {
  const { sequelize, DwellingType, PriceListItem, Package } = db;
  return await DwellingType.findAll({
    where: { builder_id: builderId },
    order: [["createdAt", "DESC"]],
  });
}

// CREATE
export async function createDwellingTypeService(data, user) {
  const { sequelize, DwellingType, PriceListItem, Package } = db;
  const t = await sequelize.transaction();

  try {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;
    const userId = user?.user_id;

    const { name, is_active } = data;

    if (!builderId && !companyId) {
      throw new Error("Unauthorized: Missing builder or company ID.");
    }

    if (!name) {
      throw new Error("Dwelling type name is required.");
    }

    const dupCheck = await DwellingType.findOne({
      where: {
        [Op.and]: [
          literal(`LOWER(name) = LOWER('${name.trim().replace(/'/g, "''")}')`),
          {
            [Op.or]: [
              { builder_id: builderId },
              { company_id: companyId },
            ],
          },
        ],
      },
      transaction: t,
    });

    if (dupCheck) {
      // A demo row holding the name is not a real clash — the builder is
      // claiming that name, so hand the row over instead of refusing. Keeps its
      // id so anything already pointing at it stays valid.
      if (isSampleRow(dupCheck)) {
        await adoptSampleRow(
          dupCheck,
          {
            name: name.trim(),
            is_active: is_active ?? true,
            updated_by: userId,
          },
          t,
        );
        await t.commit();
        return dupCheck;
      }

      throw new Error("Dwelling type already exists.");
    }

    const newDwellingType = await DwellingType.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name: name.trim(),
        is_active: is_active ?? true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction: t },
    );

    await t.commit();
    return newDwellingType;

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// UPDATE
export async function updateDwellingTypeService(id, data, user) {
  const { sequelize, DwellingType, PriceListItem, Package } = db;
  const t = await sequelize.transaction();

  try {
    const builderId = user.builder_id;
    const userId = user.user_id;
    const { name } = data;

    const existing = await DwellingType.findOne({
      where: { dwelling_type_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Dwelling type not found.");
    }
    if (!existing.is_active) {
      throw new Error("Inactive dwelling type.");
    }
    if (!name) {
      throw new Error("Name is required.");
    }

    const dup = await DwellingType.findOne({
      where: {
        builder_id: builderId,
        dwelling_type_id: { [Op.ne]: id },
        is_sample_data: false,
        [Op.and]: literal(`LOWER(name) = LOWER('${name.trim().replace(/'/g, "''")}')`),
      },
      transaction: t,
    });

    if (dup) {
      throw new Error("Dwelling type already exists.");
    }

    await existing.update(
      {
        name: name.trim(),
        updated_by: userId,
        updatedAt: new Date(),
      },
      { transaction: t },
    );

    await t.commit();
    return existing;

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// DELETE
export async function deleteDwellingTypeService(id, builderId) {
  const { sequelize, DwellingType, PriceListItem, Package } = db;
  const t = await sequelize.transaction();

  try {
    const existing = await DwellingType.findOne({
      where: { dwelling_type_id: id, builder_id: builderId },
      transaction: t,
    });

    if (!existing) {
      throw new Error("Dwelling type not found.");
    }

    await PriceListItem.update(
      {
        dwelling_type_id: literal(
          `array_remove(dwelling_type_id, '${id}'::uuid)`,
        ),
      },
      {
        where: literal(`'${id}'::uuid = ANY(dwelling_type_id)`),
        transaction: t,
      },
    );

    await Package.update(
      {
        dwelling_type_id: literal(
          `array_remove(dwelling_type_id, '${id}'::uuid)`,
        ),
      },
      {
        where: literal(`'${id}'::uuid = ANY(dwelling_type_id)`),
        transaction: t,
      },
    );

    await existing.destroy({ transaction: t });

    await t.commit();
    return existing;

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// UPDATE ACTIVE
export async function updateDwellingTypeActiveService(id, is_active, user) {
  const { DwellingType } = db;

  const builderId = user?.builder_id;
  const userId = user?.user_id;

  if (!id) {
    throw new Error("dwelling type id is required");
  }
  if (typeof is_active !== "boolean") {
    throw new Error("is_active must be boolean");
  }

  const existing = await DwellingType.findOne({
    where: { dwelling_type_id: id, builder_id: builderId },
  });

  if (!existing) {
    throw new Error("dwelling type not found");
  }

  await existing.update({
    is_active,
    updated_by: userId,
    updatedAt: new Date(),
  });

  return existing;
}
