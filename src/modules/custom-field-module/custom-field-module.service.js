import db from "../../config/database/models/postgre-models/index.js";

/**
 * CREATE CUSTOM FIELD MODULE SERVICE
 */
export async function createCustomFieldModuleService(payload) {
  const { CustomFieldModule } = db;
  const { name, description } = payload;

  const exists = await CustomFieldModule.findOne({ where: { name } });
  if (exists) {
    const error = new Error("Custom field module with this name already exists.");
    error.status = 400;
    throw error;
  }

  const module = await CustomFieldModule.create({ name, description });

  const result = module.toJSON();
  return {
    moduleId: result.module_id,
    name: result.name,
    description: result.description,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * GET ALL CUSTOM FIELD MODULES SERVICE
 */
export async function getAllCustomFieldModulesService(page, limit) {
  const { CustomFieldModule } = db;

  const pageValue = parseInt(page) || 1;
  const limitValue = parseInt(limit) || 10;
  const offset = (pageValue - 1) * limitValue;

  const { rows, count } = await CustomFieldModule.findAndCountAll({
    limit: limitValue,
    offset: offset,
    order: [["createdAt", "DESC"]],
  });

  const customFieldModules = rows.map((module) => {
    const item = module.toJSON();
    return {
      moduleId: item.module_id,
      name: item.name,
      description: item.description,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  return {
    customFieldModules,
    pagination: {
      currentPage: pageValue,
      totalPages: Math.ceil(count / limitValue),
      totalRecords: count,
      limit: limitValue,
    },
  };
}

/**
 * UPDATE CUSTOM FIELD MODULE SERVICE
 */
export async function updateCustomFieldModuleService(moduleId, payload) {
  const { CustomFieldModule } = db;
  const { name, description } = payload;

  const transaction = await db.sequelize.transaction();

  try {
    const existingModule = await CustomFieldModule.findByPk(moduleId, { transaction });
    if (!existingModule) {
      const error = new Error("Custom field module not found.");
      error.status = 404;
      throw error;
    }

    if (name) {
      const existsName = await CustomFieldModule.findOne({
        where: { name, module_id: { [db.Sequelize.Op.ne]: moduleId } },
        transaction,
      });
      if (existsName) {
        const error = new Error("Custom field module with this name already exists.");
        error.status = 400;
        throw error;
      }
    }

    await existingModule.update(
      {
        name: name !== undefined ? name : existingModule.name,
        description: description !== undefined ? description : existingModule.description,
      },
      { transaction },
    );

    await transaction.commit();

    const result = existingModule.toJSON();
    return {
      moduleId: result.module_id,
      name: result.name,
      description: result.description,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * DELETE CUSTOM FIELD MODULE SERVICE
 */
export async function deleteCustomFieldModuleService(moduleId) {
  const { CustomFieldModule } = db;

  const transaction = await db.sequelize.transaction();

  try {
    const existingModule = await CustomFieldModule.findByPk(moduleId, { transaction });
    if (!existingModule) {
      const error = new Error("Custom field module not found.");
      error.status = 404;
      throw error;
    }

    const result = existingModule.toJSON();
    await existingModule.destroy({ transaction });

    await transaction.commit();

    return {
      moduleId: result.module_id,
      name: result.name,
      description: result.description,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

export default {
  createCustomFieldModuleService,
  getAllCustomFieldModulesService,
  updateCustomFieldModuleService,
  deleteCustomFieldModuleService,
};
