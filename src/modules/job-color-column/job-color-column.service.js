import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Creates a new job color column.
 */
export const createJobColorColumnService = async (data, userContext) => {
  const { JobColorColumns, JobColorSettings } = db;
  const { builderId, companyId } = userContext;
  const { column_name, display_option, sort_order, width } = data;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: Missing builder or company ID." };
  }

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Get settings
    const settings = await JobColorSettings.findOne({
      where: { builder_id: builderId },
      transaction,
    });

    if (!settings) {
      throw { status: 404, message: "Job color settings not found for this builder." };
    }

    const jobColorSettingsId = settings.job_color_settings_id;

    // 2. Validate display_option logic
    if (display_option === "show_in_existing_items_column") {
      if ((sort_order !== null && sort_order !== undefined) || (width !== null && width !== undefined)) {
        throw { status: 400, message: "When display_option is 'show_in_existing_items_column', both sort_order and width must be null." };
      }
    } else if (display_option !== "show_in_existing_items_column") {
      if (sort_order === null || sort_order === undefined || width === null || width === undefined) {
        throw { status: 400, message: "sort_order and width are required when display_option is not 'show_in_existing_items_column'." };
      }
    }

    // 3. Duplicate check for sort_order
    if (sort_order !== null && sort_order !== undefined) {
      const dup = await JobColorColumns.findOne({
        where: { job_color_settings_id: jobColorSettingsId, sort_order },
        transaction,
      });
      if (dup) {
        throw { status: 400, message: "Sort order already exists for this setting." };
      }
    }

    // 4. Create
    const newColumn = await JobColorColumns.create(
      {
        job_color_settings_id: jobColorSettingsId,
        column_name,
        display_option,
        sort_order: sort_order || null,
        width: width || null,
      },
      { transaction },
    );

    return newColumn.get({ plain: true });
  });
};

/**
 * Retrieves all job color columns for a builder.
 */
export const getAllJobColorColumnsService = async (queryParams, userContext) => {
  const { JobColorColumns, JobColorSettings } = db;
  const { builderId } = userContext;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const page = parseInt(queryParams.page) || 1;
  const limit = parseInt(queryParams.limit) || 25;
  const offset = (page - 1) * limit;

  const { count, rows } = await JobColorColumns.findAndCountAll({
    include: [
      {
        model: JobColorSettings,
        as: "jobColorSettings",
        where: { builder_id: builderId },
        attributes: [], // We only need the join for filtering
      },
    ],
    order: [["sort_order", "ASC"]],
    limit,
    offset,
  });

  return {
    jobColorColumn: rows.map((r) => r.get({ plain: true })),
    totalRecord: count,
    curruntPage: page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
};

/**
 * Updates a job color column.
 */
export const updateJobColorColumnService = async (id, data, userContext) => {
  const { JobColorColumns, JobColorSettings } = db;
  const { builderId } = userContext;
  const { column_name, display_option, sort_order, width } = data;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  if (!column_name && !display_option && sort_order === undefined && width === undefined) {
    throw { status: 400, message: "At least one field must be provided to update." };
  }

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Check existence and ownership
    const existing = await JobColorColumns.findOne({
      where: { job_color_column_id: id },
      include: [
        {
          model: JobColorSettings,
          as: "jobColorSettings",
          where: { builder_id: builderId },
          attributes: ["job_color_settings_id"],
        },
      ],
      transaction,
    });

    if (!existing) {
      throw { status: 404, message: "Job color column not found for this builder." };
    }

    const oldDisplay = existing.display_option;

    // 2. Complex display_option constraints
    if (oldDisplay === "show_in_existing_items_column") {
      if (!display_option) {
        if (sort_order !== undefined || width !== undefined) {
          throw { status: 400, message: "Cannot update sort_order or width unless you change display_option away from 'show_in_existing_items_column'." };
        }
      } else if (display_option === "dont_show" || display_option === "show_as_separate_column") {
        if (sort_order === undefined || width === undefined) {
          throw { status: 400, message: "sort_order and width are required when changing from 'show_in_existing_items_column'." };
        }
      }
    }

    if (display_option && (display_option === "dont_show" || display_option === "show_as_separate_column")) {
      if (sort_order === undefined && existing.sort_order === null) {
         // This handles cases where sort_order was missing in both updated data and existing record
         throw { status: 400, message: "sort_order and width are required when changing display_option to 'dont_show' or 'show_as_separate_column'." };
      }
      if (width === undefined && existing.width === null) {
         throw { status: 400, message: "sort_order and width are required when changing display_option to 'dont_show' or 'show_as_separate_column'." };
      }
    }

    // 3. Final value preparation
    let finalSortOrder = sort_order;
    let finalWidth = width;

    if (display_option === "show_in_existing_items_column") {
      if (sort_order !== undefined || width !== undefined) {
        throw { status: 400, message: "Do not send sort_order or width when changing display_option to 'show_in_existing_items_column'." };
      }
      finalSortOrder = null;
      finalWidth = null;
    } else {
      finalSortOrder = finalSortOrder === undefined ? existing.sort_order : finalSortOrder;
      finalWidth = finalWidth === undefined ? existing.width : finalWidth;
    }

    // 4. Duplicate sort_order check
    if (finalSortOrder !== null && display_option !== "show_in_existing_items_column") {
      const dup = await JobColorColumns.findOne({
        where: {
          job_color_settings_id: existing.job_color_settings_id,
          sort_order: finalSortOrder,
          job_color_column_id: { [Op.ne]: id },
        },
        transaction,
      });

      if (dup) {
        throw { status: 400, message: "Duplicate sort_order not allowed within the same settings." };
      }
    }

    // 5. Perform update
    const updateBody = {
      column_name: column_name || existing.column_name,
      display_option: display_option || existing.display_option,
      sort_order: finalSortOrder,
      width: finalWidth,
      updated_at: new Date(),
    };

    await existing.update(updateBody, { transaction });

    return existing.get({ plain: true });
  });
};

export default {
  createJobColorColumnService,
  getAllJobColorColumnsService,
  updateJobColorColumnService,
};
