import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

// ============================================================
//        SERVICE CRUD OPERATIONS
// ============================================================

export async function createService(currentUser, payload) {
  const { Service, Builder } = db;
  const { service } = payload;
  const builderId = currentUser.builder_id;

  if (!service) {
    throw { status: 400, message: "Service name is required." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Check if builder exists
    const builder = await Builder.findByPk(builderId, { transaction });
    if (!builder) {
      throw { status: 404, message: "Builder not found with the provided ID." };
    }

    // 2. Duplicate check (case-insensitive) for global or same-builder services
    const existingService = await Service.findOne({
      where: {
        [Op.and]: [
          db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('service')), service.toLowerCase()),
          {
            [Op.or]: [
              { builder_id: builderId },
              { builder_id: null }
            ]
          },
          { is_deleted: false }
        ]
      },
      transaction
    });

    if (existingService) {
      if (existingService.is_sample_data) {
        await existingService.update({
          service,
          is_sample_data: false
        }, { transaction });
        await transaction.commit();
        return keysToCamelCase(existingService.get({ plain: true }));
      }
      throw { status: 409, message: "Service already exists." };
    }

    // 3. Create service
    const newService = await Service.create({
      service,
      builder_id: builderId
    }, { transaction });

    await transaction.commit();
    return keysToCamelCase(newService.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw { status: 409, message: "Service already exists." };
    }
    throw error;
  }
}

export async function getServices(currentUser) {
  const { Service } = db;
  const builderId = currentUser.builder_id;

  const services = await Service.findAll({
    where: {
      [Op.or]: [
        { builder_id: null },
        { builder_id: builderId }
      ],
      is_deleted: false
    },
    order: [["createdAt", "DESC"]]
  });

  return keysToCamelCase(services.map(s => s.get({ plain: true })));
}

export async function getServiceById(currentUser, service_id) {
  const { Service } = db;
  const builderId = currentUser.builder_id;

  const service = await Service.findOne({
    where: {
      service_id,
      [Op.or]: [
        { builder_id: null },
        { builder_id: builderId }
      ],
      is_deleted: false
    }
  });

  if (!service) {
    throw { status: 404, message: "Service not found." };
  }

  return keysToCamelCase(service.get({ plain: true }));
}

export async function updateService(currentUser, service_id, payload) {
  const { Service } = db;
  const builderId = currentUser.builder_id;
  const { service } = payload;

  if (!service) {
    throw { status: 400, message: "Service name is required." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Ownership check
    const existing = await Service.findOne({
      where: { service_id, builder_id: builderId, is_deleted: false },
      transaction
    });

    if (!existing) {
      throw { status: 404, message: "Service not found or you don't have permission to update this service." };
    }

    // 2. Duplicate check
    const duplicate = await Service.findOne({
      where: {
        service_id: { [Op.ne]: service_id },
        [Op.and]: [
          db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('service')), service.toLowerCase()),
          {
            [Op.or]: [
              { builder_id: builderId },
              { builder_id: null }
            ]
          },
          { is_deleted: false }
        ]
      },
      transaction
    });

    if (duplicate) {
      if (duplicate.is_sample_data) {
        await duplicate.update({ is_deleted: true }, { transaction });
      } else {
        throw { status: 409, message: "Service name already exists." };
      }
    }

    // 3. Update
    await existing.update({ service }, { transaction });

    await transaction.commit();
    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw { status: 409, message: "Service name already exists." };
    }
    throw error;
  }
}

export async function deleteService(currentUser, service_id) {
  const { Service, Contractor } = db;
  const builderId = currentUser.builder_id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Ownership check
    const existing = await Service.findOne({
      where: { service_id, builder_id: builderId, is_deleted: false },
      transaction
    });

    if (!existing) {
      throw { status: 404, message: "Service not found or you don't have permission to delete this service." };
    }

    // 2. Contractor usage check
    const contractorCount = await Contractor.count({
      where: { service_id, is_deleted: false },
      transaction
    });

    if (contractorCount > 0) {
      throw { status: 400, message: "Cannot delete service. It is being used by one or more contractors." };
    }

    // 3. Soft delete
    await existing.update({ is_deleted: true }, { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService
};
