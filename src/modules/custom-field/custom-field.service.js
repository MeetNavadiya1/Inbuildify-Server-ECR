import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

const VALID_FIELD_TYPES = ["text", "number", "date", "checkbox", "list", "multiline"];

// ── Shared owner OR condition (used across all service functions) ─────────────
function ownerWhere(builderId, companyId) {
  return {
    [Op.or]: [
      { builder_id: { [Op.ne]: null }, [Op.and]: { builder_id: builderId } },
      { company_id: { [Op.ne]: null }, [Op.and]: { company_id: companyId } },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// //without transtion
// export async function getAllCustomFieldsService({ builderId, companyId, page, limit, moduleId }) {
//   const offset = (page - 1) * limit;

//   const where = {
//     builder_id: builderId,
//     company_id: companyId,
//   };

//   if (moduleId) {
//     where.module_id = moduleId;
//   }

//   const { rows: customFields, count: totalRecords } = await db.CustomField.findAndCountAll({
//     where,
//     order: [["sort_order", "ASC"]],
//     limit,
//     offset,
//   });

//   const totalPages = Math.ceil(totalRecords / limit);

//   return {
//     customFields: keysToCamelCase(customFields.map((cf) => cf.toJSON())),
//     pagination: {
//       currentPage: page,
//       totalPages,
//       totalRecords,
//       limit,
//     },
//   };
// }

export async function getAllCustomFieldsService({ builderId, companyId, page, limit, moduleId }) {
  const offset = (page - 1) * limit;

  const where = { builder_id: builderId, company_id: companyId };
  if (moduleId) {
    where.module_id = moduleId;
  }

  const { rows: customFields, count: totalRecords } = await db.CustomField.findAndCountAll({
    where,
    order: [["sort_order", "ASC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    customFields: keysToCamelCase(customFields.map((cf) => cf.toJSON())),
    pagination: { currentPage: page, totalPages, totalRecords, limit },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createCustomFieldService({ builderId, companyId, userId, payload }) {
  let { module_id, field_name, field_type, sort_order, is_active } = payload;

  if (!VALID_FIELD_TYPES.includes(field_type?.toLowerCase())) {
    const error = new Error("Invalid field_type. Must be one of: text, number, date, checkbox, list, multiline.");
    error.status = 400;
    throw error;
  }

  const validModule = await db.CustomFieldModule.findOne({ where: { module_id }, attributes: ["module_id"] });
  if (!validModule) {
    const error = new Error("Invalid module_id. Module not found in custom_field_module.");
    error.status = 400;
    throw error;
  }

  const duplicateField = await db.CustomField.findOne({
    where: {
      module_id, builder_id: builderId, company_id: companyId,
      field_name: db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("field_name")), field_name.trim().toLowerCase()),
    },
    attributes: ["custom_field_id"],
  });
  if (duplicateField) {
    const error = new Error("Custom field with this name already exists for this module.");
    error.status = 400;
    throw error;
  }

  if (sort_order === undefined || sort_order === null) {
    sort_order = 1;
  }

  const maxSortOrderResult = await db.CustomField.max("sort_order", {
    where: { module_id, company_id: companyId, builder_id: builderId },
  });
  const maxSortOrder = maxSortOrderResult || 0;

  if (sort_order < 1 || sort_order > maxSortOrder + 1) {
    const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
    error.status = 400;
    throw error;
  }

  // ── Transaction: shift + insert ───────────────────────────────────────────
  const t = await db.sequelize.transaction();
  try {
    await db.CustomField.increment("sort_order", {
      by: 1,
      where: { sort_order: { [Op.gte]: sort_order }, module_id, company_id: companyId, builder_id: builderId },
      transaction: t,
    });

    const newField = await db.CustomField.create({
      company_id: companyId, builder_id: builderId, module_id,
      field_name: field_name.trim(), field_type: field_type.toLowerCase(),
      sort_order, is_active: is_active ?? true,
      created_by: userId || null, updated_by: userId || null,
    }, { transaction: t });

    await t.commit();
    return keysToCamelCase(newField.toJSON());
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function updateCustomFieldService({ id, builderId, companyId, userId, payload }) {
  const { field_name, field_type, sort_order } = payload;

  const existing = await db.CustomField.findOne({ where: { custom_field_id: id, builder_id: builderId } });
  if (!existing) {
    const error = new Error("Custom field not found or not owned by this builder.");
    error.status = 404;
    throw error;
  }
  if (!existing.is_active) {
    const error = new Error("inactive custom field.");
    error.status = 404;
    throw error;
  }

  const moduleId = existing.module_id;
  const existingSortOrder = existing.sort_order;

  if (field_type && Array.isArray(existing.options) && existing.options.length > 0 && field_type.toLowerCase() !== existing.field_type) {
    const error = new Error("Field type cannot be updated because options already exist for this field.");
    error.status = 400;
    throw error;
  }

  if (field_type && !VALID_FIELD_TYPES.includes(field_type.toLowerCase())) {
    const error = new Error("Invalid field_type. Must be one of: text, number, date, checkbox, list, multiline.");
    error.status = 400;
    throw error;
  }

  if (field_name) {
    const duplicate = await db.CustomField.findOne({
      where: {
        module_id: moduleId, is_active: true, custom_field_id: { [Op.ne]: id },
        field_name: db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("field_name")), field_name.toLowerCase()),
        ...ownerWhere(builderId, companyId),
      },
      attributes: ["custom_field_id"],
    });
    if (duplicate) {
      const error = new Error("Custom field with this name already exists.");
      error.status = 400;
      throw error;
    }
  }

  if (sort_order !== undefined && sort_order !== null) {
    const maxSortOrder = await db.CustomField.max("sort_order", {
      where: { module_id: moduleId, is_active: true, ...ownerWhere(builderId, companyId) },
    }) || 0;

    if (sort_order < 1 || sort_order > maxSortOrder) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
      error.status = 400;
      throw error;
    }
  }

  // ── Transaction: rebalance + update ──────────────────────────────────────
  const t = await db.sequelize.transaction();
  try {
    if (sort_order !== undefined && sort_order !== null && sort_order !== existingSortOrder) {
      const sharedWhere = {
        custom_field_id: { [Op.ne]: id },
        module_id: moduleId,
        is_active: true,
        ...ownerWhere(builderId, companyId),
      };

      if (sort_order > existingSortOrder) {
        await db.CustomField.decrement("sort_order", {
          by: 1,
          where: { ...sharedWhere, sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order } },
          transaction: t,
        });
      } else {
        await db.CustomField.increment("sort_order", {
          by: 1,
          where: { ...sharedWhere, sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder } },
          transaction: t,
        });
      }
    }

    const [, [updatedField]] = await db.CustomField.update({
      field_name: field_name || existing.field_name,
      field_type: field_type ? field_type.toLowerCase() : existing.field_type,
      sort_order: sort_order ?? existing.sort_order,
      updated_by: userId || null,
      company_id: companyId,
      builder_id: builderId,
    }, { where: { custom_field_id: id }, returning: true, transaction: t });

    await t.commit();
    return keysToCamelCase(updatedField.toJSON());
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCustomFieldService({ id, builderId, companyId }) {
  const existing = await db.CustomField.findOne({
    where: { custom_field_id: id, ...ownerWhere(builderId, companyId) },
    attributes: ["custom_field_id", "sort_order", "module_id"],
  });

  if (!existing) {
    const error = new Error("Custom field not found.");
    error.status = 404;
    throw error;
  }

  // ── Transaction: shift + destroy ──────────────────────────────────────────
  const t = await db.sequelize.transaction();
  try {
    await db.CustomField.decrement("sort_order", {
      by: 1,
      where: { module_id: existing.module_id, sort_order: { [Op.gt]: existing.sort_order }, ...ownerWhere(builderId, companyId) },
      transaction: t,
    });

    await db.CustomField.destroy({
      where: { custom_field_id: id, ...ownerWhere(builderId, companyId) },
      transaction: t,
    });

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function updateCustomFieldIsActiveService({ id, builderId, userId, is_active }) {
  const existing = await db.CustomField.findOne({
    where: { custom_field_id: id, builder_id: builderId },
    attributes: ["custom_field_id"],
  });
  if (!existing) {
    const error = new Error("custom field not found for this builder");
    error.status = 404;
    throw error;
  }

  const [, [updated]] = await db.CustomField.update(
    { is_active, updated_by: userId || null },
    { where: { custom_field_id: id }, returning: true },
  );
  return keysToCamelCase(updated.toJSON());
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createOptionService({ custom_field_id, options, builderId, companyId, userId }) {
  const field = await db.CustomField.findOne({
    where: { custom_field_id, ...ownerWhere(builderId, companyId) },
    attributes: ["custom_field_id", "field_type", "options"],
  });
  if (!field) {
    const error = new Error("Custom field not found.");
    error.status = 404;
    throw error;
  }
  if (field.field_type !== "list") {
    const error = new Error("Options can only be added to fields of type 'list'.");
    error.status = 400;
    throw error;
  }

  const existingOptions = field.options || [];
  const normalizedExisting = existingOptions.map((o) => o.toLowerCase());
  const newUniqueOptions = options.map((o) => o.trim()).filter((o) => o && !normalizedExisting.includes(o.toLowerCase()));

  if (newUniqueOptions.length === 0) {
    const error = new Error("All provided options already exist.");
    error.status = 409;
    throw error;
  }

  const [, [updated]] = await db.CustomField.update(
    { options: [...existingOptions, ...newUniqueOptions], updated_by: userId || null },
    { where: { custom_field_id }, returning: true },
  );
  return keysToCamelCase(updated.toJSON());
}

// ─────────────────────────────────────────────────────────────────────────────

export async function deleteOptionService({ custom_field_id, options, builderId, companyId, userId }) {
  const field = await db.CustomField.findOne({
    where: { custom_field_id, ...ownerWhere(builderId, companyId) },
    attributes: ["custom_field_id", "field_type", "options"],
  });
  if (!field) {
    const error = new Error("Custom field not found.");
    error.status = 404;
    throw error;
  }
  if (field.field_type !== "list") {
    const error = new Error("Options can only be deleted from list type fields.");
    error.status = 400;
    throw error;
  }

  const existingOptions = field.options || [];
  const optionsToDelete = options.map((o) => o.toLowerCase());
  const filteredOptions = existingOptions.filter((opt) => !optionsToDelete.includes(opt.toLowerCase()));

  if (filteredOptions.length === existingOptions.length) {
    const error = new Error("None of the provided options exist.");
    error.status = 404;
    throw error;
  }

  const [, [updated]] = await db.CustomField.update(
    { options: filteredOptions, updated_by: userId || null },
    { where: { custom_field_id }, returning: true },
  );
  return keysToCamelCase(updated.toJSON());
}
// ─────────────────────────────────────────────────────────────────────────────

// export async function createCustomFieldService({ builderId, companyId, userId, payload }) {
//   let { module_id, field_name, field_type, sort_order, is_active } = payload;

//   // ── Validate field_type ─────────────────────────────────────────────────────
//   if (!VALID_FIELD_TYPES.includes(field_type?.toLowerCase())) {
//     const error = new Error("Invalid field_type. Must be one of: text, number, date, checkbox, list, multiline.");
//     error.status = 400;
//     throw error;
//   }

//   // ── Validate module_id ──────────────────────────────────────────────────────
//   const validModule = await db.CustomFieldModule.findOne({
//     where: { module_id },
//     attributes: ["module_id"],
//   });

//   if (!validModule) {
//     const error = new Error("Invalid module_id. Module not found in custom_field_module.");
//     error.status = 400;
//     throw error;
//   }

//   // ── Duplicate field name check ──────────────────────────────────────────────
//   const duplicateField = await db.CustomField.findOne({
//     where: {
//       module_id,
//       builder_id: builderId,
//       company_id: companyId,
//       field_name: db.sequelize.where(
//         db.sequelize.fn("LOWER", db.sequelize.col("field_name")),
//         field_name.trim().toLowerCase(),
//       ),
//     },
//     attributes: ["custom_field_id"],
//   });

//   if (duplicateField) {
//     const error = new Error("Custom field with this name already exists for this module.");
//     error.status = 400;
//     throw error;
//   }

//   // ── Resolve sort_order ──────────────────────────────────────────────────────
//   if (sort_order === undefined || sort_order === null) {
//     sort_order = 1;
//   }

//   const maxSortOrderResult = await db.CustomField.max("sort_order", {
//     where: { module_id, company_id: companyId, builder_id: builderId },
//   });

//   const maxSortOrder = maxSortOrderResult || 0;

//   if (sort_order < 1 || sort_order > maxSortOrder + 1) {
//     const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
//     error.status = 400;
//     throw error;
//   }

//   // ── Transaction: shift sort_orders + insert ─────────────────────────────────
//   const t = await db.sequelize.transaction();
//   try {
//     await db.CustomField.increment("sort_order", {
//       by: 1,
//       where: {
//         sort_order: { [Op.gte]: sort_order },
//         module_id,
//         company_id: companyId,
//         builder_id: builderId,
//       },
//       transaction: t,
//     });

//     const newField = await db.CustomField.create({
//       company_id: companyId,
//       builder_id: builderId,
//       module_id,
//       field_name: field_name.trim(),
//       field_type: field_type.toLowerCase(),
//       sort_order,
//       is_active: is_active ?? true,
//       created_by: userId || null,
//       updated_by: userId || null,
//     }, { transaction: t });

//     await t.commit();
//     return keysToCamelCase(newField.toJSON());
//   } catch (err) {
//     await t.rollback();
//     throw err;
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────

// export async function updateCustomFieldService({ id, builderId, companyId, userId, payload }) {
//   const { field_name, field_type, sort_order } = payload;

//   // ── Check field exists and is owned by builder ──────────────────────────────
//   const existing = await db.CustomField.findOne({
//     where: { custom_field_id: id, builder_id: builderId },
//   });

//   if (!existing) {
//     const error = new Error("Custom field not found or not owned by this builder.");
//     error.status = 404;
//     throw error;
//   }

//   if (!existing.is_active) {
//     const error = new Error("inactive custom field.");
//     error.status = 404;
//     throw error;
//   }

//   const moduleId = existing.module_id;
//   const existingSortOrder = existing.sort_order;

//   // ── Cannot change field_type if options exist ───────────────────────────────
//   if (
//     field_type &&
//     Array.isArray(existing.options) &&
//     existing.options.length > 0 &&
//     field_type.toLowerCase() !== existing.field_type
//   ) {
//     const error = new Error("Field type cannot be updated because options already exist for this field.");
//     error.status = 400;
//     throw error;
//   }

//   // ── Validate field_type ─────────────────────────────────────────────────────
//   if (field_type && !VALID_FIELD_TYPES.includes(field_type.toLowerCase())) {
//     const error = new Error("Invalid field_type. Must be one of: text, number, date, checkbox, list, multiline.");
//     error.status = 400;
//     throw error;
//   }

//   // ── Duplicate field_name check ──────────────────────────────────────────────
//   if (field_name) {
//     const duplicate = await db.CustomField.findOne({
//       where: {
//         module_id: moduleId,
//         is_active: true,
//         custom_field_id: { [Op.ne]: id },
//         field_name: db.sequelize.where(
//           db.sequelize.fn("LOWER", db.sequelize.col("field_name")),
//           field_name.toLowerCase(),
//         ),
//         ...ownerWhere(builderId, companyId),
//       },
//       attributes: ["custom_field_id"],
//     });

//     if (duplicate) {
//       const error = new Error("Custom field with this name already exists.");
//       error.status = 400;
//       throw error;
//     }
//   }

//   // ── Validate sort_order range ───────────────────────────────────────────────
//   if (sort_order !== undefined && sort_order !== null) {
//     const maxSortOrder = await db.CustomField.max("sort_order", {
//       where: {
//         module_id: moduleId,
//         is_active: true,
//         ...ownerWhere(builderId, companyId),
//       },
//     }) || 0;

//     if (sort_order < 1 || sort_order > maxSortOrder) {
//       const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.`);
//       error.status = 400;
//       throw error;
//     }
//   }

//   // ── Transaction: rebalance sort_order + update ──────────────────────────────
//   const t = await db.sequelize.transaction();
//   try {
//     if (sort_order !== undefined && sort_order !== null && sort_order !== existingSortOrder) {
//       const sharedWhere = {
//         custom_field_id: { [Op.ne]: id },
//         module_id: moduleId,
//         is_active: true,
//         ...ownerWhere(builderId, companyId),
//       };

//       if (sort_order > existingSortOrder) {
//         await db.CustomField.decrement("sort_order", {
//           by: 1,
//           where: { ...sharedWhere, sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order } },
//           transaction: t,
//         });
//       } else {
//         await db.CustomField.increment("sort_order", {
//           by: 1,
//           where: { ...sharedWhere, sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder } },
//           transaction: t,
//         });
//       }
//     }

//     const updatePayload = {
//       field_name: field_name || existing.field_name,
//       field_type: field_type ? field_type.toLowerCase() : existing.field_type,
//       sort_order: sort_order ?? existing.sort_order,
//       updated_by: userId || null,
//       company_id: companyId,
//       builder_id: builderId,
//     };

//     const [, [updatedField]] = await db.CustomField.update(updatePayload, {
//       where: { custom_field_id: id },
//       returning: true,
//       transaction: t,
//     });

//     await t.commit();
//     return keysToCamelCase(updatedField.toJSON());
//   } catch (err) {
//     await t.rollback();
//     throw err;
//   }
// }

// ─────────────────────────────────────────────────────────────────────────────
//without transtion
// export async function deleteCustomFieldService({ id, builderId, companyId }) {
//   const existing = await db.CustomField.findOne({
//     where: {
//       custom_field_id: id,
//       ...ownerWhere(builderId, companyId),
//     },
//     attributes: ["custom_field_id", "sort_order", "module_id"],
//   });

//   if (!existing) {
//     const error = new Error("Custom field not found.");
//     error.status = 404;
//     throw error;
//   }

//   await db.CustomField.decrement("sort_order", {
//     by: 1,
//     where: {
//       module_id: existing.module_id,
//       sort_order: { [Op.gt]: existing.sort_order },
//       ...ownerWhere(builderId, companyId),
//     },
//   });

//   await db.CustomField.destroy({
//     where: {
//       custom_field_id: id,
//       ...ownerWhere(builderId, companyId),
//     },
//   });
// }

// export async function deleteCustomFieldService({ id, builderId, companyId }) {
//   // ── Check custom field exists and is owned ──────────────────────────────────
//   const existing = await db.CustomField.findOne({
//     where: {
//       custom_field_id: id,
//       ...ownerWhere(builderId, companyId),
//     },
//     attributes: ["custom_field_id", "sort_order", "module_id"],
//   });

//   if (!existing) {
//     const error = new Error("Custom field not found.");
//     error.status = 404;
//     throw error;
//   }

//   // ── Transaction: shift sort_orders + destroy ────────────────────────────────
//   const t = await db.sequelize.transaction();
//   try {
//     await db.CustomField.decrement("sort_order", {
//       by: 1,
//       where: {
//         module_id: existing.module_id,
//         sort_order: { [Op.gt]: existing.sort_order },
//         ...ownerWhere(builderId, companyId),
//       },
//       transaction: t,
//     });

//     await db.CustomField.destroy({
//       where: {
//         custom_field_id: id,
//         ...ownerWhere(builderId, companyId),
//       },
//       transaction: t,
//     });

//     await t.commit();
//   } catch (err) {
//     await t.rollback();
//     throw err;
//   }
// }

// ─────────────────────────────────────────────────────────────────────────────

// export async function updateCustomFieldIsActiveService({ id, builderId, userId, is_active }) {
//   const existing = await db.CustomField.findOne({
//     where: { custom_field_id: id, builder_id: builderId },
//     attributes: ["custom_field_id"],
//   });

//   if (!existing) {
//     const error = new Error("custom field not found for this builder");
//     error.status = 404;
//     throw error;
//   }

//   const [, [updated]] = await db.CustomField.update(
//     { is_active, updated_by: userId || null },
//     { where: { custom_field_id: id }, returning: true },
//   );

//   return keysToCamelCase(updated.toJSON());
// }

// ─────────────────────────────────────────────────────────────────────────────

// export async function createOptionService({ custom_field_id, options, builderId, companyId, userId }) {
//   const field = await db.CustomField.findOne({
//     where: { custom_field_id, ...ownerWhere(builderId, companyId) },
//     attributes: ["custom_field_id", "field_type", "options"],
//   });

//   if (!field) {
//     const error = new Error("Custom field not found.");
//     error.status = 404;
//     throw error;
//   }

//   if (field.field_type !== "list") {
//     const error = new Error("Options can only be added to fields of type 'list'.");
//     error.status = 400;
//     throw error;
//   }

//   const existingOptions = field.options || [];
//   const normalizedExisting = existingOptions.map((o) => o.toLowerCase());
//   const newUniqueOptions = options
//     .map((o) => o.trim())
//     .filter((o) => o && !normalizedExisting.includes(o.toLowerCase()));

//   if (newUniqueOptions.length === 0) {
//     const error = new Error("All provided options already exist.");
//     error.status = 409;
//     throw error;
//   }

//   const updatedOptions = [...existingOptions, ...newUniqueOptions];

//   const [, [updated]] = await db.CustomField.update(
//     { options: updatedOptions, updated_by: userId || null },
//     { where: { custom_field_id }, returning: true },
//   );

//   return keysToCamelCase(updated.toJSON());
// }

// ─────────────────────────────────────────────────────────────────────────────

// export async function deleteOptionService({ custom_field_id, options, builderId, companyId, userId }) {
//   const field = await db.CustomField.findOne({
//     where: { custom_field_id, ...ownerWhere(builderId, companyId) },
//     attributes: ["custom_field_id", "field_type", "options"],
//   });

//   if (!field) {
//     const error = new Error("Custom field not found.");
//     error.status = 404;
//     throw error;
//   }

//   if (field.field_type !== "list") {
//     const error = new Error("Options can only be deleted from list type fields.");
//     error.status = 400;
//     throw error;
//   }

//   const existingOptions = field.options || [];
//   const optionsToDelete = options.map((o) => o.toLowerCase());
//   const filteredOptions = existingOptions.filter(
//     (opt) => !optionsToDelete.includes(opt.toLowerCase()),
//   );

//   if (filteredOptions.length === existingOptions.length) {
//     const error = new Error("None of the provided options exist.");
//     error.status = 404;
//     throw error;
//   }

//   const [, [updated]] = await db.CustomField.update(
//     { options: filteredOptions, updated_by: userId || null },
//     { where: { custom_field_id }, returning: true },
//   );

//   return keysToCamelCase(updated.toJSON());
// }
