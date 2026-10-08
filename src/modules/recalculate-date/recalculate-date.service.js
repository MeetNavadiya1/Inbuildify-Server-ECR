import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches or creates recalculate date settings for a builder/company.
 */
export const getOrCreateRecalculateDateService = async ({ builderId, companyId, userId }) => {
  const { RecalculateDate, Sequelize } = db;
  const { Op } = Sequelize;

  // 1. Try to fetch existing
  const existing = await RecalculateDate.findOne({
    where: {
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ],
    },
  });

  if (existing) {
    return {
      data: keysToCamelCase(existing.toJSON()),
      isNew: false,
    };
  }

  // 2. Create if not found
  const created = await RecalculateDate.create({
    builder_id: builderId || null,
    company_id: companyId || null,
    created_by: userId,
    updated_by: userId,
  });

  return {
    data: keysToCamelCase(created.toJSON()),
    isNew: true,
  };
};

/**
 * Updates recalculate date settings with dependency validation.
 */
export const updateRecalculateDateService = async ({ builderId, companyId, userId, data }) => {
  const { RecalculateDate, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    recalculate_workflow_job_estimated_dates,
    recalculate_construction_job_estimated_dates,
    capture_reason_rebooking_and_rebooking_email,
    capture_text,
    recalculate_confirmed_booking_dates,
  } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Fetch and Lock existing
    const existing = await RecalculateDate.findOne({
      where: {
        [Op.or]: [
          { builder_id: builderId || null },
          { company_id: companyId || null },
        ],
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!existing) {
      const error = new Error("Recalculate Date record not found.");
      error.status = 404;
      throw error;
    }

    // 2. Dependency Validations
    const old = existing.toJSON();

    if (
      old.recalculate_construction_job_estimated_dates === false &&
      (recalculate_construction_job_estimated_dates === undefined ||
        recalculate_construction_job_estimated_dates === false ||
        String(recalculate_construction_job_estimated_dates) === "false")
    ) {
      if (
        capture_reason_rebooking_and_rebooking_email !== undefined ||
        capture_text !== undefined ||
        recalculate_confirmed_booking_dates !== undefined
      ) {
        const error = new Error("Cannot update 'capture_reason_rebooking_and_rebooking_email', 'capture_text', or 'recalculate_confirmed_booking_dates' because 'recalculate_construction_job_estimated_dates' is already false. Set it to true first.");
        error.status = 400;
        throw error;
      }
    }

    if (
      old.capture_reason_rebooking_and_rebooking_email === false &&
      capture_text !== undefined &&
      capture_reason_rebooking_and_rebooking_email === undefined
    ) {
      const error = new Error("When 'capture_reason_rebooking_and_rebooking_email' is false, you cannot define 'capture_text'.");
      error.status = 400;
      throw error;
    }

    if (
      recalculate_construction_job_estimated_dates === false ||
      String(recalculate_construction_job_estimated_dates) === "false"
    ) {
      if (
        capture_reason_rebooking_and_rebooking_email !== undefined ||
        capture_text !== undefined ||
        recalculate_confirmed_booking_dates !== undefined
      ) {
        const error = new Error("When 'recalculate_construction_job_estimated_dates' is false, you cannot define 'capture_reason_rebooking_and_rebooking_email', 'capture_text', or 'recalculate_confirmed_booking_dates'.");
        error.status = 400;
        throw error;
      }
    }

    if (
      capture_reason_rebooking_and_rebooking_email === false ||
      String(capture_reason_rebooking_and_rebooking_email) === "false"
    ) {
      if (capture_text !== undefined) {
        const error = new Error("When 'capture_reason_rebooking_and_rebooking_email' is false, you cannot define 'capture_text'.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Collect updates
    const updateData = {
      updated_by: userId,
    };

    if (recalculate_workflow_job_estimated_dates !== undefined) {
      updateData.recalculate_workflow_job_estimated_dates = recalculate_workflow_job_estimated_dates;
    }

    if (recalculate_construction_job_estimated_dates !== undefined) {
      updateData.recalculate_construction_job_estimated_dates = recalculate_construction_job_estimated_dates;
    }

    if (
      recalculate_construction_job_estimated_dates === false ||
      String(recalculate_construction_job_estimated_dates) === "false"
    ) {
      updateData.recalculate_confirmed_booking_dates = false;
      updateData.capture_reason_rebooking_and_rebooking_email = false;
      updateData.capture_text = null;
    } else {
      if (capture_reason_rebooking_and_rebooking_email !== undefined) {
        updateData.capture_reason_rebooking_and_rebooking_email = capture_reason_rebooking_and_rebooking_email;
      }

      if (
        capture_reason_rebooking_and_rebooking_email === false ||
        String(capture_reason_rebooking_and_rebooking_email) === "false"
      ) {
        updateData.capture_text = null;
      } else if (capture_text !== undefined) {
        updateData.capture_text = capture_text;
      }

      if (recalculate_confirmed_booking_dates !== undefined) {
        updateData.recalculate_confirmed_booking_dates = recalculate_confirmed_booking_dates;
      }
    }

    const fieldsToUpdate = [
      "recalculate_workflow_job_estimated_dates",
      "recalculate_construction_job_estimated_dates",
      "capture_reason_rebooking_and_rebooking_email",
      "capture_text",
      "recalculate_confirmed_booking_dates",
    ];
    const isUpdating = fieldsToUpdate.some(field => data.hasOwnProperty(field));
    if (!isUpdating) {
      const error = new Error("At least one field must be provided to update.");
      error.status = 400;
      throw error;
    }

    // 4. Update
    await existing.update(updateData, { transaction });

    await transaction.commit();

    return keysToCamelCase(existing.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  getOrCreateRecalculateDateService,
  updateRecalculateDateService,
};
