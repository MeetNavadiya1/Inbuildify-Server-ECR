import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Fetches integration settings for a builder/company.
 * If no settings exist, creates default settings.
 */
export const getUserIntegrationSettingsService = async (userContext) => {
  const { IntegrationSettings } = db;
  const { companyId, builderId, userId } = userContext;

  let settings = await IntegrationSettings.findOne({
    where: {
      company_id: companyId,
      builder_id: builderId,
    },
  });

  if (!settings) {
    settings = await IntegrationSettings.create({
      company_id: companyId,
      builder_id: builderId,
      created_by: userId,
      updated_by: userId,
    });
  }

  return settings.get({ plain: true });
};

/**
 * Updates integration settings for a builder/company.
 */
export const updateIntegrationSettingsService = async (updateData, userContext) => {
  const { IntegrationSettings, Users } = db;
  const { companyId, builderId, userId } = userContext;

  const {
    automatically_send_welcome_email,
    rea_hl_enabled,
    canibuild_enabled,
    website_hl_enabled,
    google_enabled,
    assign_leads_if_assignee_not_found,
    always_assign_leads_to,
  } = updateData;

  // 1. Validation for user assignments
  if (assign_leads_if_assignee_not_found) {
    const user = await Users.findOne({
      where: {
        users_id: assign_leads_if_assignee_not_found,
        is_deleted: false,
        is_verified: true,
      },
    });
    if (!user) {
      throw { status: 400, message: "Invalid user for assign_leads_if_assignee_not_found." };
    }
  }

  if (always_assign_leads_to) {
    const user = await Users.findOne({
      where: {
        users_id: always_assign_leads_to,
        is_deleted: false,
        is_verified: true,
      },
    });
    if (!user) {
      throw { status: 400, message: "Invalid user for always_assign_leads_to." };
    }
  }

  // 2. Locate existing settings
  const settings = await IntegrationSettings.findOne({
    where: {
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
    },
  });

  if (!settings) {
    throw { status: 404, message: "Integration settings not found." };
  }

  // 3. Prepare update object
  const fieldsToUpdate = {
    updated_by: userId,
  };

  if (automatically_send_welcome_email !== undefined) fieldsToUpdate.automatically_send_welcome_email = automatically_send_welcome_email;
  if (rea_hl_enabled !== undefined) fieldsToUpdate.rea_hl_enabled = rea_hl_enabled;
  if (canibuild_enabled !== undefined) fieldsToUpdate.canibuild_enabled = canibuild_enabled;
  if (website_hl_enabled !== undefined) fieldsToUpdate.website_hl_enabled = website_hl_enabled;
  if (google_enabled !== undefined) fieldsToUpdate.google_enabled = google_enabled;
  if (assign_leads_if_assignee_not_found !== undefined) fieldsToUpdate.assign_leads_if_assignee_not_found = assign_leads_if_assignee_not_found;
  if (always_assign_leads_to !== undefined) fieldsToUpdate.always_assign_leads_to = always_assign_leads_to;

  // 4. Update
  await settings.update(fieldsToUpdate);

  return settings.get({ plain: true });
};

export default {
  getUserIntegrationSettingsService,
  updateIntegrationSettingsService,
};
