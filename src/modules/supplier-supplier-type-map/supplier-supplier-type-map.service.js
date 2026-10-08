import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/* ---------------------------------
   SUPPLIER TYPE MAPPING
---------------------------------- */

/**
 * Create a new mapping between a supplier and a supplier type
 */
export async function createSupplierTypeMapService({ builderId, payload }) {
  const { supplier_id, supplier_type_id } = payload;

  if (!supplier_id || !supplier_type_id) {
    const error = new Error("supplier_id and supplier_type_id are required.");
    error.status = 400;
    throw error;
  }

  const transaction = await db.sequelize.transaction();
  try {
    // Validate supplier
    const supplier = await db.Supplier.findOne({
      where: { supplier_id, builder_id: builderId, status: true },
      transaction,
    });

    if (!supplier) {
      const error = new Error("Invalid supplier: does not belong to this builder or is inactive.");
      error.status = 403;
      throw error;
    }

    // Validate supplier type
    const supplierType = await db.SupplierType.findOne({
      where: { supplier_type_id, builder_id: builderId, is_active: true },
      transaction,
    });

    if (!supplierType) {
      const error = new Error("Invalid supplier type: does not belong to this builder or is inactive.");
      error.status = 403;
      throw error;
    }

    // Check existing mapping
    const mappingExists = await db.SupplierSupplierTypeMap.findOne({
      where: { supplier_id, supplier_type_id },
      transaction,
    });

    if (mappingExists) {
      const error = new Error("This supplier is already mapped to this supplier type.");
      error.status = 400;
      throw error;
    }

    const mapping = await db.SupplierSupplierTypeMap.create(
      { supplier_id, supplier_type_id },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(mapping.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Get all mappings between suppliers and supplier types
 */
export async function getAllSupplierTypeMapsService({ builderId, queryParams }) {
  const { supplier_type_id } = queryParams;

  const where = {};
  if (supplier_type_id) {
    where.supplier_type_id = supplier_type_id;
  }

  const records = await db.SupplierSupplierTypeMap.findAll({
    include: [
      {
        model: db.Supplier,
        as: "supplier",
        where: { builder_id: builderId },
        attributes: [["company_name", "supplier_name"]],
      },
      {
        model: db.SupplierType,
        as: "supplierType",
        attributes: [["name", "supplier_type_name"]],
      },
    ],
    where,
    order: [["createdAt", "DESC"]],
  });

  return records.map((r) => {
    const plain = r.get({ plain: true });
    return keysToCamelCase({
      ...plain,
      supplier_name: plain.supplier?.supplier_name,
      supplier_type_name: plain.supplierType?.supplier_type_name,
      supplier: undefined,
      supplierType: undefined,
    });
  });
}

/**
 * Update a supplier mapping (e.g. set as recommended)
 */
export async function updateSupplierTypeMapService({ builderId, id, payload }) {
  const { assign_to_new_and_existing_checklist } = payload;

  const transaction = await db.sequelize.transaction();
  try {
    const mapping = await db.SupplierSupplierTypeMap.findOne({
      where: { id },
      include: [
        { model: db.Supplier, as: "supplier", attributes: ["builder_id"] },
        { model: db.SupplierType, as: "supplierType", attributes: ["builder_id"] },
      ],
      transaction,
    });

    if (!mapping) {
      const error = new Error("Mapping not found.");
      error.status = 404;
      throw error;
    }

    if (mapping.supplier.builder_id !== builderId || mapping.supplierType.builder_id !== builderId) {
      const error = new Error("Mapping does not belong to this builder.");
      error.status = 403;
      throw error;
    }

    // Set all other records with same supplier_type_id to is_recommended = false
    await db.SupplierSupplierTypeMap.update(
      { is_recommended: false },
      {
        where: {
          supplier_type_id: mapping.supplier_type_id,
          id: { [Op.ne]: id },
        },
        transaction,
      },
    );

    // Update current record
    await mapping.update(
      {
        is_recommended: true,
        assign_to_new_and_existing_checklist:
          assign_to_new_and_existing_checklist !== undefined
            ? assign_to_new_and_existing_checklist
            : mapping.assign_to_new_and_existing_checklist,
        updatedAt: new Date(),
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(mapping.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Delete a supplier mapping
 */
export async function deleteSupplierSupplierTypeMapService({ builderId, id }) {
  const transaction = await db.sequelize.transaction();
  try {
    const mapping = await db.SupplierSupplierTypeMap.findOne({
      where: { id },
      include: [
        { model: db.Supplier, as: "supplier", attributes: ["builder_id"] },
        { model: db.SupplierType, as: "supplierType", attributes: ["builder_id"] },
      ],
      transaction,
    });

    if (!mapping) {
      const error = new Error("Record not found");
      error.status = 404;
      throw error;
    }

    if (mapping.supplier.builder_id !== builderId) {
      const error = new Error("You cannot delete other builder supplier records");
      error.status = 403;
      throw error;
    }

    if (mapping.supplierType.builder_id !== builderId) {
      const error = new Error("You cannot delete other builder supplier type records");
      error.status = 403;
      throw error;
    }

    await mapping.destroy({ transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* ---------------------------------
   CONSTRUCTION CHECKLIST MAPPING
---------------------------------- */

/**
 * Create a mapping between a supplier type and a construction checklist
 */
export async function createSupplierTypeConstructionChecklistMapService({ builderId, payload }) {
  const { supplier_type_id, construction_checklist_id } = payload;

  if (!supplier_type_id || !construction_checklist_id) {
    const error = new Error("supplier_type_id and construction_checklist_id are required.");
    error.status = 400;
    throw error;
  }

  const supplierType = await db.SupplierType.findOne({
    where: { supplier_type_id, builder_id: builderId },
  });

  if (!supplierType) {
    const error = new Error("Supplier type does not belong to this builder.");
    error.status = 403;
    throw error;
  }

  const existingMapping = await db.SupplierTypeConstructionChecklistMap.findOne({
    where: { supplier_type_id, construction_checklist_id },
  });

  if (existingMapping) {
    const error = new Error("This supplier type is already mapped to this construction checklist.");
    error.status = 400;
    throw error;
  }

  const mapping = await db.SupplierTypeConstructionChecklistMap.create({
    supplier_type_id,
    construction_checklist_id,
  });

  return keysToCamelCase(mapping.toJSON());
}

/**
 * Delete a mapping between a supplier type and a construction checklist
 */
export async function deleteSupplierTypeConstructionChecklistMapService({ builderId, id }) {
  const mapping = await db.SupplierTypeConstructionChecklistMap.findOne({
    where: { id },
    include: [{ model: db.SupplierType, as: "supplierType", attributes: ["builder_id"] }],
  });

  if (!mapping) {
    const error = new Error("Mapping not found");
    error.status = 404;
    throw error;
  }

  if (mapping.supplierType.builder_id !== builderId) {
    const error = new Error("You cannot delete other builder supplier type construction checklist mappings");
    error.status = 403;
    throw error;
  }

  await mapping.destroy();
}

/**
 * Get all mappings between supplier types and construction checklists
 */
export async function getAllSupplierTypeConstructionChecklistMapsService({ builderId, queryParams }) {
  const { supplier_type_id } = queryParams;

  const where = {};
  if (supplier_type_id) {
    where.supplier_type_id = supplier_type_id;
  }

  const records = await db.SupplierTypeConstructionChecklistMap.findAll({
    include: [
      {
        model: db.SupplierType,
        as: "supplierType",
        where: { builder_id: builderId },
        attributes: [["name", "supplier_type_name"]],
      },
    ],
    where,
    order: [["createdAt", "DESC"]],
  });

  return records.map((r) => {
    const plain = r.get({ plain: true });
    return keysToCamelCase({
      ...plain,
      supplier_type_name: plain.supplierType?.supplier_type_name,
      supplierType: undefined,
    });
  });
}
