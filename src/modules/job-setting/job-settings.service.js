import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

/**
 * Creates job settings for a builder or company.
 * @param {Object} data - The settings data.
 * @param {Object} user - The user object containing IDs.
 * @param {Object} transaction - Optional Sequelize transaction.
 */
export async function createJobSettingsService(data, user, transaction = null) {
  const t = transaction || (await db.sequelize.transaction());
  const isExternalTransaction = !!transaction;

  try {
    const { builder_id, company_id, user_id } = user;

    if (!builder_id && !company_id) {
      const error = new Error("Unauthorized: Missing builder or company ID.");
      error.status = 401;
      throw error;
    }

    // Duplicate check
    const existing = await db.JobSettings.findOne({
      where: {
        [Op.or]: [
          { builder_id: builder_id || null },
          { company_id: company_id || null },
        ],
      },
      transaction: t,
    });

    if (existing) {
      const error = new Error("Job settings already exist for this builder/company.");
      error.status = 400;
      throw error;
    }

    const {
      auto_move_to_maintenance,
      auto_mark_completed,
      auto_archive_after_completion,
      auto_archive_after_days,
      milestone_status_check_days,
      report_custom_days,
      report_status_filter,
      report_include_date,
    } = data;

    // Validation
    if (
      (auto_archive_after_completion === false && auto_archive_after_days) ||
      (auto_archive_after_completion === undefined && auto_archive_after_days)
    ) {
      const error = new Error(
        "You cannot set auto_archive_after_days when auto_archive_after_completion is FALSE.",
      );
      error.status = 400;
      throw error;
    }

    const result = await db.JobSettings.create(
      {
        company_id,
        builder_id,
        auto_move_to_maintenance: auto_move_to_maintenance ?? false,
        auto_mark_completed: auto_mark_completed ?? false,
        auto_archive_after_completion: auto_archive_after_completion ?? false,
        auto_archive_after_days: auto_archive_after_days || null,
        milestone_status_check_days: milestone_status_check_days || null,
        report_custom_days: report_custom_days || null,
        report_status_filter: report_status_filter || "all",
        report_include_date: report_include_date ?? true,
        created_by: user_id,
        updated_by: user_id,
      },
      { transaction: t },
    );

    if (!isExternalTransaction) {
      await t.commit();
    }
    return result.toJSON();
  } catch (error) {
    if (!isExternalTransaction) {
      await t.rollback();
    }
    throw error;
  }
}

/**
 * Updates job settings for a builder or company.
 * @param {Object} data - The settings data to update.
 * @param {Object} user - The user object containing IDs.
 * @param {Object} transaction - Optional Sequelize transaction.
 */
export async function updateJobSettingsService(data, user, transaction = null) {
  const t = transaction || (await db.sequelize.transaction());
  const isExternalTransaction = !!transaction;

  try {
    const { builder_id, company_id, user_id } = user;

    if (!builder_id && !company_id) {
      const error = new Error("Unauthorized: Missing builder or company ID.");
      error.status = 401;
      throw error;
    }

    const {
      auto_move_to_maintenance,
      auto_mark_completed,
      auto_archive_after_completion,
      auto_archive_after_days,
      milestone_status_check_days,
      report_custom_days,
      report_status_filter,
      report_include_date,
    } = data;

    const existing = await db.JobSettings.findOne({
      where: {
        [Op.or]: [
          { builder_id: builder_id || null },
          { company_id: company_id || null },
        ],
      },
      transaction: t,
    });

    if (!existing) {
      const error = new Error("Job settings not found for this user.");
      error.status = 404;
      throw error;
    }

    // Original validation logic:
    // 1. auto_archive_after_days cannot be updated when auto_archive_after_completion is false.
    if (
      auto_archive_after_completion === false &&
      auto_archive_after_days !== undefined
    ) {
      const error = new Error(
        "auto_archive_after_days cannot be updated when auto_archive_after_completion is false.",
      );
      error.status = 400;
      throw error;
    }

    // 2. auto_archive_after_days cannot be updated if existing is false and not being set to true.
    if (
      existing.auto_archive_after_completion === false &&
      auto_archive_after_completion !== true &&
      auto_archive_after_days !== undefined
    ) {
      const error = new Error(
        "auto_archive_after_days cannot be updated when auto_archive_after_completion is false.",
      );
      error.status = 400;
      throw error;
    }

    const updatePayload = {};
    if (auto_move_to_maintenance !== undefined) {
      updatePayload.auto_move_to_maintenance = auto_move_to_maintenance;
    }
    if (auto_mark_completed !== undefined) {
      updatePayload.auto_mark_completed = auto_mark_completed;
    }
    if (auto_archive_after_completion !== undefined) {
      updatePayload.auto_archive_after_completion = auto_archive_after_completion;
    }
    if (auto_archive_after_days !== undefined) {
      updatePayload.auto_archive_after_days = auto_archive_after_days;
    }
    if (milestone_status_check_days !== undefined) {
      updatePayload.milestone_status_check_days = milestone_status_check_days;
    }
    if (report_custom_days !== undefined) {
      updatePayload.report_custom_days = report_custom_days;
    }
    if (report_status_filter !== undefined) {
      updatePayload.report_status_filter = report_status_filter;
    }
    if (report_include_date !== undefined) {
      updatePayload.report_include_date = report_include_date;
    }

    // 3. Force auto_archive_after_days to null if completion is toggled to false.
    if (
      existing.auto_archive_after_completion === true &&
      auto_archive_after_completion === false
    ) {
      updatePayload.auto_archive_after_days = null;
    }

    if (Object.keys(updatePayload).length === 0) {
      const error = new Error("No valid fields provided for update.");
      error.status = 400;
      throw error;
    }

    updatePayload.updated_by = user_id;

    await existing.update(updatePayload, { transaction: t });

    if (!isExternalTransaction) {
      await t.commit();
    }
    return existing.toJSON();
  } catch (error) {
    if (!isExternalTransaction) {
      await t.rollback();
    }
    throw error;
  }
}

/**
 * Fetches job settings for a user. If not found, creates default settings.
 * @param {Object} user - The user object containing IDs.
 * @param {Object} transaction - Optional Sequelize transaction.
 */
export async function getUserJobSettingsService(user, transaction = null) {
  const t = transaction || (await db.sequelize.transaction());
  const isExternalTransaction = !!transaction;

  try {
    const { company_id, builder_id, user_id } = user;

    if (!builder_id && !company_id) {
      const error = new Error("Unauthorized: Missing builder or company ID.");
      error.status = 401;
      throw error;
    }

    const [jobSettings] = await db.JobSettings.findOrCreate({
      where: {
        company_id: company_id || null,
        builder_id: builder_id || null,
      },
      defaults: {
        company_id,
        builder_id,
        created_by: user_id,
        updated_by: user_id,
      },
      transaction: t,
    });

    if (!isExternalTransaction) {
      await t.commit();
    }
    return jobSettings.toJSON();
  } catch (error) {
    if (!isExternalTransaction) {
      await t.rollback();
    }
    throw error;
  }
}
