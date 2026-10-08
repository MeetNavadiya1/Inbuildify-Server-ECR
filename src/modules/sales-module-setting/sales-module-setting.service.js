import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js"

export async function updateSalesModuleSettingsService({
  builderId,
  userId,
  payload,
}) {
  const { SalesModuleSettings, Role } = db;
  const {
    allow_duplicate_leads,
    send_email_on_new_lead,
    show_common_folders,
    lead_mandatory_option,
    role_id,
    sales_won_button_text,
    house_size_unit,
  } = payload;

  const existing = await SalesModuleSettings.findOne({
    where: { builder_id: builderId },
  });

  if (!existing) {
    throw { status: 404, message: "No sales module settings found for this builder." };
  }

  if (
    allow_duplicate_leads === undefined &&
    send_email_on_new_lead === undefined &&
    show_common_folders === undefined &&
    lead_mandatory_option === undefined &&
    role_id === undefined &&
    sales_won_button_text === undefined &&
    house_size_unit === undefined
  ) {
    throw { status: 400, message: "At least one field must be provided for update." };
  }

  // Validate roles
  if (role_id && role_id.length > 0) {
    const validRoles = await Role.findAll({
      attributes: ["role_id"],
      where: {
        role_id: { [Op.in]: role_id },
      },
    });

    if (validRoles.length !== role_id.length) {
      throw { status: 400, message: "One or more provided role id are invalid." };
    }
  }

  await existing.update({
    ...(allow_duplicate_leads !== undefined && { allow_duplicate_leads }),
    ...(send_email_on_new_lead !== undefined && { send_email_on_new_lead }),
    ...(show_common_folders !== undefined && { show_common_folders }),
    ...(lead_mandatory_option !== undefined && { lead_mandatory_option }),
    ...(role_id !== undefined && { role_id }),
    ...(sales_won_button_text !== undefined && { sales_won_button_text }),
    ...(house_size_unit !== undefined && { house_size_unit }),
    updated_by: userId,
  });

  return existing;
}

export async function getSalesModuleSettingService({
  company_id,
  builder_id,
  user_id,
}) {
  const { SalesModuleSettings } = db;
  let settings = await SalesModuleSettings.findOne({
    where: { company_id, builder_id },
    order: [["created_at", "DESC"]],
  });

  if (!settings) {
    settings = await SalesModuleSettings.create({
      company_id,
      builder_id,
      created_by: user_id,
      updated_by: user_id,
    });
  }

  return settings;
}
