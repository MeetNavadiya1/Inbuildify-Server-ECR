import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

const DEFAULT_JOB_COLOR_COLUMNS = [
  {
    column_name: "Colour",
    display_option: "show_as_separate_column",
    sort_order: 1,
    width: null,
  },
  {
    column_name: "Description",
    display_option: "show_in_existing_items_column",
    sort_order: null,
    width: null,
  },
  {
    column_name: "Code",
    display_option: "show_in_existing_items_column",
    sort_order: null,
    width: null,
  },
  {
    column_name: "Images",
    display_option: "show_as_separate_column",
    sort_order: 2,
    width: 20,
  },
  {
    column_name: "Specification",
    display_option: "show_in_existing_items_column",
    sort_order: null,
    width: null,
  },
  {
    column_name: "Item Name",
    display_option: "show_as_separate_column",
    sort_order: 4,
    width: 20,
  },
  {
    column_name: "Items",
    display_option: "show_as_separate_column",
    sort_order: 5,
    width: 20,
  },
  {
    column_name: "Feature",
    display_option: "show_in_existing_items_column",
    sort_order: null,
    width: null,
  },
  {
    column_name: "Supplier",
    display_option: "show_in_existing_items_column",
    sort_order: null,
    width: null,
  },
  {
    column_name: "Cost",
    display_option: "show_as_separate_column",
    sort_order: 6,
    width: 20,
  },
];

/**
 * Fetches or creates job color settings for an organization.
 * Also ensures default columns are initialized.
 */
export const getUserJobColorSettingsService = async (userContext) => {
  const { JobColorSettings, JobColorColumns } = db;
  const { companyId, builderId, userId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Find or create settings
    let [settings, created] = await JobColorSettings.findOrCreate({
      where: { company_id: companyId, builder_id: builderId },
      defaults: {
        company_id: companyId,
        builder_id: builderId,
        created_by: userId,
        updated_by: userId,
      },
      transaction,
    });

    const jobColorSettingsId = settings.job_color_settings_id;

    // 2. Check for default columns
    const columnsExist = await JobColorColumns.findOne({
      where: { job_color_settings_id: jobColorSettingsId },
      transaction,
    });

    if (!columnsExist) {
      const columnsToInsert = DEFAULT_JOB_COLOR_COLUMNS.map((col) => ({
        ...col,
        job_color_settings_id: jobColorSettingsId,
      }));
      await JobColorColumns.bulkCreate(columnsToInsert, { transaction });
    }

    return settings.get({ plain: true });
  });
};

/**
 * Updates job color settings.
 */
export const updateJobColorSettingService = async (data, userContext) => {
  const { JobColorSettings } = db;
  const { builderId, companyId, userId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    const settings = await JobColorSettings.findOne({
      where: {
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!settings) {
      throw { status: 404, message: "Job color settings not found for this user." };
    }

    const {
      hide_color_item_images,
      hide_color_item_price,
      exit_color_code,
      page_orientation_portrait,
      header_text,
    } = data;

    const updateBody = {
      updated_by: userId,
      updated_at: new Date(),
    };

    if (hide_color_item_images !== undefined) updateBody.hide_color_item_images = hide_color_item_images;
    if (hide_color_item_price !== undefined) updateBody.hide_color_item_price = hide_color_item_price;
    if (exit_color_code !== undefined) updateBody.exit_color_code = exit_color_code;
    if (page_orientation_portrait !== undefined) updateBody.page_orientation_portrait = page_orientation_portrait;
    if (header_text !== undefined) updateBody.header_text = header_text;

    await settings.update(updateBody, { transaction });

    // Return only specific fields for parity
    const updatedRecord = settings.get({ plain: true });
    return {
      hideColorItemImages: updatedRecord.hide_color_item_images,
      hideColorItemPrice: updatedRecord.hide_color_item_price,
      exitColorCode: updatedRecord.exit_color_code,
      pageOrientationPortrait: updatedRecord.page_orientation_portrait,
      headerText: updatedRecord.header_text,
    };
  });
};

export default {
  getUserJobColorSettingsService,
  updateJobColorSettingService,
};
