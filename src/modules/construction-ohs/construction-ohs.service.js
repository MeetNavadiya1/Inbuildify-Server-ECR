
import db from "../../config/database/models/postgre-models/index.js";

function resolveScope(user) {
  return {
    company_id: user.company_id || null,
    builder_id: user.builder_id || null,
  };
}

/* -----------------------------
   GET OHS Settings
------------------------------ */
export async function getSettingsService(user) {
  const { company_id, builder_id } = resolveScope(user);

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const whereClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_settings_id: null };

  const existing = await db.ConstructionOhsSettings.findOne({
    where: whereClause,
  });

  if (!existing) {
    const inserted = await db.ConstructionOhsSettings.create({
      company_id: company_id || null,
      builder_id: builder_id || null,
      created_by: user.users_id,
      updated_by: user.users_id,
    });
    return inserted.toJSON();
  }

  return existing.toJSON();
}

/* -----------------------------
   UPSERT Settings
------------------------------ */
export async function upsertSettingsService(user, payload) {
  const { company_id, builder_id } = resolveScope(user);

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const whereClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_settings_id: null };

  const existing = await db.ConstructionOhsSettings.findOne({
    where: whereClause,
  });

  if (!existing) {
    const createPayload = {
      company_id: company_id || null,
      builder_id: builder_id || null,
      created_by: user.users_id,
      updated_by: user.users_id,
    };
    if (payload.signature_required !== undefined) {
      createPayload.signature_required = payload.signature_required;
    }
    if (payload.minimum_audits !== undefined) {
      createPayload.minimum_audits = payload.minimum_audits;
    }

    const inserted = await db.ConstructionOhsSettings.create(createPayload);
    return inserted.toJSON();
  }

  const updatePayload = {};
  if (payload.signature_required !== undefined) {
    updatePayload.signature_required = payload.signature_required;
  }
  if (payload.minimum_audits !== undefined) {
    updatePayload.minimum_audits = payload.minimum_audits;
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error("At least one field is required for update");
  }

  updatePayload.updated_by = user.users_id;

  await existing.update(updatePayload);

  return existing.toJSON();
}

/* -----------------------------
   GET LIST
------------------------------ */
export async function getOhsListService(user, filters = {}) {
  const { company_id, builder_id } = resolveScope(user);
  const { field_type, id } = filters;

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_list_id: null };

  const recordCount = await db.ConstructionOhsList.count({ where: orClause });

  if (recordCount === 0) {
    try {
      const settingsResult = await getSettingsService(user);

      if (settingsResult && settingsResult.construction_ohs_settings_id) {
        await db.ConstructionOhsList.bulkCreate([
          {
            company_id: company_id || null,
            builder_id: builder_id || null,
            construction_ohs_settings_id: settingsResult.construction_ohs_settings_id,
            field_type: "category",
            field_name: "Supervisor",
            description: null,
            sort_order: 1,
            created_by: user.users_id,
            updated_by: user.users_id,
          },
          {
            company_id: company_id || null,
            builder_id: builder_id || null,
            construction_ohs_settings_id: settingsResult.construction_ohs_settings_id,
            field_type: "category",
            field_name: "Supplier",
            description: null,
            sort_order: 2,
            created_by: user.users_id,
            updated_by: user.users_id,
          },
        ]);
      }
    } catch (error) {
      console.error("OHS Service - Error creating default headers:", error);
    }
  }

  // Build dynamic query with filters
  const whereClause = { ...orClause };

  if (id) {
    if (field_type === "category") {
      whereClause.field_type = "category";
      whereClause.construction_ohs_list_id = id;
    } else if (field_type === "item") {
      whereClause.parent_id = id;
    } else {
      whereClause.created_by = id;
    }
  } else if (field_type) {
    whereClause.field_type = field_type;
    whereClause.created_by = user.users_id;
  } else {
    whereClause.created_by = user.users_id;
  }

  const records = await db.ConstructionOhsList.findAll({
    where: whereClause,
    order: [["sort_order", "ASC"]],
  });

  return records.map((r) => r.toJSON());
}

/* -----------------------------
   CREATE list item
------------------------------ */
export async function createOhsListItemService(user, payload) {
  const { company_id, builder_id } = resolveScope(user);

  const settings = await getSettingsService(user);

  if (payload.field_type === "category") {
    throw new Error("Cannot create category items. Only items can be created.");
  }

  if (payload.field_type === "item" && !payload.parent_id) {
    throw new Error("Item field type must have parent_id");
  }

  const transaction = await db.sequelize.transaction();

  try {
    const orConditions = [];
    if (company_id) {
      orConditions.push({ company_id });
    }
    if (builder_id) {
      orConditions.push({ builder_id });
    }
    const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_list_id: null };

    if (payload.field_type === "item" && payload.parent_id) {
      const parentCheck = await db.ConstructionOhsList.findOne({
        where: {
          construction_ohs_list_id: payload.parent_id,
          ...orClause,
          created_by: user.users_id,
          field_type: "category",
        },
        attributes: ["construction_ohs_list_id", "field_type", "created_by"],
        transaction,
      });

      if (!parentCheck) {
        throw new Error("Parent category not found or access denied");
      }
    }

    if (payload.field_type === "item" && payload.description && payload.parent_id) {
      const duplicateCheck = await db.ConstructionOhsList.findOne({
        where: {
          description: payload.description,
          parent_id: payload.parent_id,
          ...orClause,
          created_by: user.users_id,
          field_type: "item",
        },
        attributes: ["construction_ohs_list_id"],
        transaction,
      });

      if (duplicateCheck) {
        throw new Error("Item description must be unique within the same category");
      }
    }

    let finalSortOrder = payload.sort_order;

    if (finalSortOrder === undefined || finalSortOrder === null) {
      finalSortOrder = 1;
    }

    const maxSortWhere = {
      ...orClause,
      created_by: user.users_id,
      field_type: "item",
      parent_id: payload.parent_id || null,
    };

    const maxSortOrderRaw = await db.ConstructionOhsList.max("sort_order", {
      where: maxSortWhere,
      transaction,
    });

    const maxSortOrder = (maxSortOrderRaw === null || isNaN(maxSortOrderRaw)) ? 0 : Number(maxSortOrderRaw);

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
    }

    if (finalSortOrder <= maxSortOrder) {
      await db.ConstructionOhsList.increment("sort_order", {
        by: 1,
        where: {
          ...maxSortWhere,
          sort_order: { [db.Sequelize.Op.gte]: finalSortOrder },
        },
        transaction,
      });
    }

    const inserted = await db.ConstructionOhsList.create({
      company_id: company_id || null,
      builder_id: builder_id || null,
      construction_ohs_settings_id: settings.construction_ohs_settings_id,
      field_type: payload.field_type,
      field_name: payload.field_name || null,
      description: payload.description,
      sort_order: finalSortOrder,
      parent_id: payload.parent_id || null,
      add_defaults: payload.add_defaults || false,
      created_by: user.users_id,
      updated_by: user.users_id,
    }, { transaction });

    await transaction.commit();
    return inserted.toJSON();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* -----------------------------
   UPDATE list item
------------------------------ */
export async function updateOhsListItemService(user, id, payload) {
  const { company_id, builder_id } = resolveScope(user);

  const transaction = await db.sequelize.transaction();

  try {
    const orConditions = [];
    if (company_id) {
      orConditions.push({ company_id });
    }
    if (builder_id) {
      orConditions.push({ builder_id });
    }
    const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_list_id: null };

    const existingRecord = await db.ConstructionOhsList.findOne({
      where: {
        construction_ohs_list_id: id,
        ...orClause,
        created_by: user.users_id,
      },
      transaction,
    });

    if (!existingRecord) {
      throw new Error("OHS list item not found");
    }

    if (payload.field_type) {
      throw new Error("Cannot update field_type");
    }

    if (existingRecord.field_type === "category" && payload.sort_order !== undefined) {
      throw new Error("Cannot update sort_order for category");
    }

    if (
      payload.sort_order !== undefined &&
      payload.sort_order !== null &&
      existingRecord.field_type === "item"
    ) {
      const existingSortOrder = existingRecord.sort_order;
      const parsedSortOrder = Number(payload.sort_order);

      const maxSortWhere = {
        ...orClause,
        created_by: user.users_id,
        field_type: "item",
        construction_ohs_list_id: { [db.Sequelize.Op.ne]: id },
        parent_id: existingRecord.parent_id || null,
      };

      const maxSortOrderRaw = await db.ConstructionOhsList.max("sort_order", {
        where: maxSortWhere,
        transaction,
      });

      const maxSortOrder = (maxSortOrderRaw === null || isNaN(maxSortOrderRaw)) ? 0 : Number(maxSortOrderRaw);

      if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > maxSortOrder + 1) {
        throw new Error(`Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`);
      }

      if (parsedSortOrder !== existingSortOrder) {
        if (parsedSortOrder > existingSortOrder) {
          // shift down
          await db.ConstructionOhsList.increment("sort_order", {
            by: -1,
            where: {
              ...orClause,
              created_by: user.users_id,
              field_type: "item",
              parent_id: existingRecord.parent_id || null,
              sort_order: {
                [db.Sequelize.Op.gt]: existingSortOrder,
                [db.Sequelize.Op.lte]: parsedSortOrder,
              },
              construction_ohs_list_id: { [db.Sequelize.Op.ne]: id },
            },
            transaction,
          });
        } else {
          // shift up
          await db.ConstructionOhsList.increment("sort_order", {
            by: 1,
            where: {
              ...orClause,
              created_by: user.users_id,
              field_type: "item",
              parent_id: existingRecord.parent_id || null,
              sort_order: {
                [db.Sequelize.Op.gte]: parsedSortOrder,
                [db.Sequelize.Op.lt]: existingSortOrder,
              },
              construction_ohs_list_id: { [db.Sequelize.Op.ne]: id },
            },
            transaction,
          });
        }
      }
      payload.sort_order = parsedSortOrder;
    }

    if (existingRecord.field_type === "category") {
      if (payload.sort_order) {
        throw new Error("Cannot update sort_order for category");
      }
      if (payload.parent_id) {
        throw new Error("Category field type cannot have parent_id");
      }
    }

    if (existingRecord.field_type === "item") {
      if (payload.add_defaults !== undefined) {
        throw new Error("Cannot update add_defaults for item");
      }

      if (payload.description && payload.description !== existingRecord.description) {
        const duplicateCheck = await db.ConstructionOhsList.findOne({
          where: {
            description: payload.description,
            parent_id: existingRecord.parent_id || null,
            ...orClause,
            created_by: user.users_id,
            field_type: "item",
            construction_ohs_list_id: { [db.Sequelize.Op.ne]: id },
          },
          attributes: ["construction_ohs_list_id"],
          transaction,
        });

        if (duplicateCheck) {
          throw new Error("Item description must be unique within the same category");
        }
      }
    }

    const updatePayload = {
      updated_by: user.users_id,
    };

    if (payload.description !== undefined) {
      updatePayload.description = payload.description || null;
    }
    if (payload.sort_order !== undefined) {
      updatePayload.sort_order = payload.sort_order || null;
    }
    if (payload.add_defaults !== undefined) {
      updatePayload.add_defaults = payload.add_defaults ?? null;
    }

    await existingRecord.update(updatePayload, { transaction });

    await transaction.commit();
    return existingRecord.toJSON();

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* -----------------------------
   DELETE list item
------------------------------ */
export async function deleteOhsListItemService(user, id) {
  const { company_id, builder_id } = resolveScope(user);

  const transaction = await db.sequelize.transaction();

  try {
    const orConditions = [];
    if (company_id) {
      orConditions.push({ company_id });
    }
    if (builder_id) {
      orConditions.push({ builder_id });
    }
    const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ohs_list_id: null };

    const itemToDelete = await db.ConstructionOhsList.findOne({
      where: {
        construction_ohs_list_id: id,
        field_type: "item",
        ...orClause,
        created_by: user.users_id,
      },
      attributes: ["construction_ohs_list_id", "sort_order", "parent_id"],
      transaction,
    });

    if (!itemToDelete) {
      throw new Error("Item not found, access denied, or category deletion is not allowed");
    }

    const deletedItemSortOrder = itemToDelete.sort_order;
    const deletedItemParentId = itemToDelete.parent_id;

    await itemToDelete.destroy({ transaction });

    await db.ConstructionOhsList.increment("sort_order", {
      by: -1,
      where: {
        ...orClause,
        created_by: user.users_id,
        field_type: "item",
        parent_id: deletedItemParentId || null,
        sort_order: { [db.Sequelize.Op.gt]: deletedItemSortOrder },
      },
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
