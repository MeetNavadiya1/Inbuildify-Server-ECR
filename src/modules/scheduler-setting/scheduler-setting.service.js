import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Validates if the provided user IDs exist and are not deleted.
 * @param {Array<string>} userIds
 * @throws {Error} if any user ID is invalid.
 */
async function validateUsers(userIds) {
  if (userIds && userIds.length > 0) {
    const count = await db.Users.count({
      where: {
        users_id: { [Op.in]: userIds },
        is_deleted: false,
      },
    });
    if (count !== userIds.length) {
      const error = new Error("One or more provided receiver of replies users are invalid.");
      error.statusCode = 400;
      throw error;
    }
  }
}

export async function createSchedulerSettingsService(user, payload) {
  const { builder_id: builderId, company_id: companyId, users_id: userId } = user;
  let { receiver_of_replies } = payload;
  receiver_of_replies = receiver_of_replies || [];

  if (!companyId && !builderId) {
    const error = new Error("Invalid user context. Missing company or builder ID.");
    error.statusCode = 400;
    throw error;
  }

  // Check for existing settings (from current builder or company)
  const existing = await db.SchedulerSettings.findOne({
    where: {
      [Op.or]: [
        { builder_id: builderId },
        { company_id: companyId },
      ],
    },
  });

  if (existing) {
    const error = new Error("Scheduler settings already exist for this builder/company.");
    error.statusCode = 400;
    throw error;
  }

  await validateUsers(receiver_of_replies);

  const newSettings = await db.SchedulerSettings.create({
    company_id: companyId,
    builder_id: builderId,
    receiver_of_replies,
    created_by: userId,
    updated_by: userId,
  });

  return newSettings.get({ plain: true });
}

export async function updateSchedulerSettingsService(user, payload) {
  const { builder_id: builderId, company_id: companyId, users_id: userId } = user;
  const { receiver_of_replies } = payload;

  if (!companyId && !builderId) {
    const error = new Error("Invalid user context. Missing company or builder ID.");
    error.statusCode = 400;
    throw error;
  }

  if (receiver_of_replies === undefined) {
    const error = new Error("At least one field must be provided to update.");
    error.statusCode = 400;
    throw error;
  }

  const whereScope = {
    [Op.or]: [],
  };
  if (builderId) {
    whereScope[Op.or].push({ builder_id: builderId });
  }
  if (companyId) {
    whereScope[Op.or].push({ company_id: companyId });
  }

  const existing = await db.SchedulerSettings.findOne({
    where: whereScope,
  });

  if (!existing) {
    const error = new Error("Scheduler settings not found or you are not authorized to update it.");
    error.statusCode = 404;
    throw error;
  }

  await validateUsers(receiver_of_replies);

  const [updatedCount, updatedRows] = await db.SchedulerSettings.update(
    {
      receiver_of_replies,
      updated_by: userId,
    },
    {
      where: { scheduler_settings_id: existing.scheduler_settings_id },
      returning: true,
    },
  );

  return updatedRows[0].get({ plain: true });
}

export async function getSchedulerSettingsService(user) {
  const { company_id: companyId, builder_id: builderId, users_id: userId } = user;

  if (!companyId && !builderId) {
    const error = new Error("Invalid user context. Missing company or builder ID.");
    error.statusCode = 400;
    throw error;
  }

  const whereScope = {
    [Op.or]: [],
  };
  if (builderId) {
    whereScope[Op.or].push({ builder_id: builderId });
  }
  if (companyId) {
    whereScope[Op.or].push({ company_id: companyId });
  }

  let settings = await db.SchedulerSettings.findOne({
    where: whereScope,
    attributes: ["receiver_of_replies"],
    raw: true,
  });

  if (!settings) {
    const newSettings = await db.SchedulerSettings.create({
      company_id: companyId,
      builder_id: builderId,
      created_by: userId,
      updated_by: userId,
      receiver_of_replies: [],
    });

    settings = { receiver_of_replies: newSettings.receiver_of_replies };
  }

  return settings;
}

export default {
  createSchedulerSettingsService,
  updateSchedulerSettingsService,
  getSchedulerSettingsService,
};
