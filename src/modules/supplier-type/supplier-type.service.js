import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/**
 * Create a new supplier type
 */
export async function createSupplierTypeService({ builderId, companyId, userId, payload }) {
  const { name, is_active } = payload;

  if (!name || name.trim() === "") {
    const error = new Error("Supplier type name is required.");
    error.status = 400;
    throw error;
  }

  // Duplicate check
  const duplicate = await db.SupplierType.findOne({
    where: {
      name: name.trim(),
      builder_id: builderId,
      is_sample_data: false,
    },
  });

  if (duplicate) {
    const error = new Error("Supplier type name already exists for this builder.");
    error.status = 400;
    throw error;
  }

  const supplierType = await db.SupplierType.create({
    company_id: companyId,
    builder_id: builderId,
    name: name.trim(),
    is_active: is_active ?? true,
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(supplierType.toJSON());
}

/**
 * Get all supplier types with filtering
 */
export async function getAllSupplierTypeService({ builderId, companyId, queryParams }) {
  const { is_active, name } = queryParams;

  const where = {};
  if (companyId) where.company_id = companyId;
  if (builderId) where.builder_id = builderId;

  if (is_active !== undefined) {
    where.is_active = is_active === "true" || is_active === true;
  }

  if (name) {
    where.name = { [Op.iLike]: `%${name}%` };
  }

  const records = await db.SupplierType.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });

  return keysToCamelCase(records.map((r) => r.toJSON()));
}

/**
 * Delete a supplier type and remove it from linked suppliers
 */
export async function deleteSupplierTypeService({ builderId, companyId, id }) {
  const transaction = await db.sequelize.transaction();
  try {
    const record = await db.SupplierType.findOne({
      where: {
        supplier_type_id: id,
        builder_id: builderId,
      },
      transaction,
    });

    if (!record) {
      const error = new Error("Supplier type not found or access denied.");
      error.status = 404;
      throw error;
    }

    // Remove supplier_type_id from all supplier records that reference it
    await db.sequelize.query(
      `
      UPDATE supplier 
      SET supplier_type_id = array_remove(supplier_type_id, :id)
      WHERE :id = ANY(supplier_type_id)
      AND (company_id = :companyId OR builder_id = :builderId)
      `,
      {
        replacements: { id, companyId: companyId || null, builderId },
        transaction,
      },
    );

    await record.destroy({ transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Update a supplier type with complex state validation
 */
export async function updateSupplierTypeService({ builderId, companyId, userId, id, payload }) {
  const { name, is_active } = payload;

  const record = await db.SupplierType.findOne({
    where: {
      supplier_type_id: id,
      builder_id: builderId,
    },
  });

  if (!record) {
    const error = new Error("Supplier type not found for this builder.");
    error.status = 404;
    throw error;
  }

  const currentIsActive = record.is_active;
  const updatingOtherFields = name !== undefined;
  const requestedIsActiveTrue = is_active === true || is_active === "true";
  const requestedIsActiveFalse = is_active === false || is_active === "false";

  // Complex state machine validation
  if (currentIsActive === true && is_active !== undefined) {
    if (requestedIsActiveFalse && updatingOtherFields) {
      const error = new Error(
        "To deactivate an active supplier type, 'is_active' must be the only field provided in the request.",
      );
      error.status = 403;
      throw error;
    }
  }

  if (currentIsActive === false) {
    if (requestedIsActiveTrue && updatingOtherFields) {
      const error = new Error(
        "To activate an inactive supplier type, 'is_active' must be the only field provided in the request.",
      );
      error.status = 403;
      throw error;
    }

    if (updatingOtherFields && (is_active === undefined || requestedIsActiveFalse)) {
      const error = new Error(
        "Cannot update non-'is_active' fields when the supplier type is currently inactive. Only 'is_active' can be changed (to true).",
      );
      error.status = 403;
      throw error;
    }

    if (is_active !== undefined && requestedIsActiveFalse) {
      const error = new Error(
        "Supplier type is already inactive. 'is_active' can only be updated to true from this state.",
      );
      error.status = 403;
      throw error;
    }
  }

  if (name) {
    const duplicate = await db.SupplierType.findOne({
      where: {
        name: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("name")),
          name.trim().toLowerCase(),
        ),
        builder_id: builderId,
        is_sample_data: false,
        supplier_type_id: { [Op.ne]: id },
      },
    });

    if (duplicate) {
      const error = new Error("Supplier type name already exists for another record.");
      error.status = 400;
      throw error;
    }
  }

  const updateData = {
    updated_by: userId,
  };

  if (name !== undefined) updateData.name = name.trim();
  if (is_active !== undefined) updateData.is_active = requestedIsActiveTrue;
  if (companyId) updateData.company_id = companyId;

  await record.update(updateData);

  return keysToCamelCase(record.toJSON());
}
