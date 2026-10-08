import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/**
 * Resolves the job_color_settings_id for the given builder/company scope.
 * Returns the ID string, or null if not found.
 * Must be called inside a transaction.
 */
async function resolveJobColorSettingsId(builderId, companyId, transaction) {
  const { JobColorSettings } = db;

  const settings = await JobColorSettings.findOne({
    where: {
      [Op.or]: [
        ...(builderId ? [{ builder_id: builderId }] : []),
        ...(companyId ? [{ company_id: companyId }] : []),
      ],
    },
    attributes: ["job_color_settings_id"],
    transaction,
  });

  return settings?.job_color_settings_id ?? null;
}

// ─── SERVICE: CREATE JOB COLOR COLUMN SECTION ────────────────────────────────

/**
 * Creates a new JobColorColumnSection.
 * Resolves settings ID, validates and shifts sort_order, then inserts.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createJobColorColumnSectionService({
  builderId,
  companyId,
  section_name,
  sort_order,
  attachments,
}) {
  const { JobColorColumnSections, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Resolve settings ───────────────────────────────────────────────────
    const jobColorSettingsId = await resolveJobColorSettingsId(builderId, companyId, transaction);
    if (!jobColorSettingsId) {
      await transaction.rollback();
      return { error: { status: 400, message: "Job color settings not found." } };
    }

    // ── Sort order handling ────────────────────────────────────────────────
    const finalSortOrder = sort_order ?? 1;

    const maxSortOrder = await JobColorColumnSections.max("sort_order", {
      where: { job_color_settings_id: jobColorSettingsId },
      transaction,
    }) ?? 0;

    if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.`,
        },
      };
    }

    // Shift existing sections at or after the target position down by 1
    await JobColorColumnSections.increment("sort_order", {
      by: 1,
      where: {
        job_color_settings_id: jobColorSettingsId,
        sort_order: { [Op.gte]: finalSortOrder },
      },
      transaction,
    });

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await JobColorColumnSections.create(
      {
        job_color_settings_id: jobColorSettingsId,
        section_name,
        attachments,
        sort_order: finalSortOrder,
      },
      { transaction },
    );

    await transaction.commit();

    return { data: keysToCamelCase(created.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET JOB COLOR COLUMN SECTIONS ──────────────────────────────────

/**
 * Fetches paginated JobColorColumnSections for the builder/company's settings.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function getJobColorColumnSectionsService({
  builderId,
  companyId,
  page = 1,
  limit = 25,
}) {
  const { JobColorColumnSections, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Resolve settings ───────────────────────────────────────────────────
    const jobColorSettingsId = await resolveJobColorSettingsId(builderId, companyId, transaction);
    if (!jobColorSettingsId) {
      await transaction.rollback();
      return { error: { status: 400, message: "Job color settings not found." } };
    }

    await transaction.commit();

    // ── Read-only paginated fetch (no transaction needed after settings check) ─
    const limitValue = parseInt(limit, 10);
    const pageValue = parseInt(page, 10);
    const offset = (pageValue - 1) * limitValue;

    const { count, rows } = await JobColorColumnSections.findAndCountAll({
      where: { job_color_settings_id: jobColorSettingsId },
      attributes: [
        "job_color_column_section_id",
        "section_name",
        "attachments",
        "sort_order",
      ],
      order: [["sort_order", "ASC"]],
      limit: limitValue,
      offset,
    });

    return {
      data: {
        JobColorColumnSections: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
        pagination: {
          currentPage: pageValue,
          totalPages: Math.ceil(count / limitValue),
          totalRecords: count,
          limit: limitValue,
        },
      },
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: DELETE JOB COLOR COLUMN SECTION ────────────────────────────────

/**
 * Deletes a JobColorColumnSection by ID and re-sequences sort_order.
 *
 * @returns {{ success: true }|{ error: { status: number, message: string } }}
 */
export async function deleteJobColorColumnSectionService({
  builderId,
  companyId,
  job_color_column_section_id,
}) {
  const { JobColorColumnSections, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Resolve settings ───────────────────────────────────────────────────
    const jobColorSettingsId = await resolveJobColorSettingsId(builderId, companyId, transaction);
    if (!jobColorSettingsId) {
      await transaction.rollback();
      return { error: { status: 400, message: "Job color settings not found." } };
    }

    // ── Find & authorize ───────────────────────────────────────────────────
    const section = await JobColorColumnSections.findOne({
      where: {
        job_color_column_section_id,
        job_color_settings_id: jobColorSettingsId,
      },
      attributes: ["job_color_column_section_id", "sort_order"],
      transaction,
    });

    if (!section) {
      await transaction.rollback();
      return { error: { status: 404, message: "Section not found." } };
    }

    const deletedSortOrder = section.sort_order;

    // ── Delete ─────────────────────────────────────────────────────────────
    await section.destroy({ transaction });

    // Re-sequence: shift sections after the deleted position up by 1
    await JobColorColumnSections.decrement("sort_order", {
      by: 1,
      where: {
        job_color_settings_id: jobColorSettingsId,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();

    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE JOB COLOR COLUMN SECTION ────────────────────────────────

/**
 * Updates a JobColorColumnSection by ID.
 * Handles sort_order re-sequencing and S3 deletion for replaced attachments.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateJobColorColumnSectionService({
  builderId,
  companyId,
  job_color_column_section_id,
  section_name,
  sort_order,
  attachments,
}) {
  const { JobColorColumnSections, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Resolve settings ───────────────────────────────────────────────────
    const jobColorSettingsId = await resolveJobColorSettingsId(builderId, companyId, transaction);
    if (!jobColorSettingsId) {
      await transaction.rollback();
      return { error: { status: 400, message: "Job color settings not found." } };
    }

    // ── Find & authorize ───────────────────────────────────────────────────
    const section = await JobColorColumnSections.findOne({
      where: {
        job_color_column_section_id,
        job_color_settings_id: jobColorSettingsId,
      },
      transaction,
    });

    if (!section) {
      await transaction.rollback();
      return { error: { status: 404, message: "Section not found." } };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    if (!section_name && attachments === undefined && sort_order === undefined) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "At least one field (section_name, attachments, or sort_order) is required to update.",
        },
      };
    }

    // ── Sort order re-sequencing ───────────────────────────────────────────
    if (sort_order !== undefined && sort_order !== null) {
      const maxSort = await JobColorColumnSections.max("sort_order", {
        where: { job_color_settings_id: jobColorSettingsId },
        transaction,
      }) ?? 0;

      if (sort_order < 1 || sort_order > maxSort) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: `Invalid sort_order. Allowed range is 1 to ${maxSort}.`,
          },
        };
      }

      const oldSortOrder = section.sort_order;

      if (sort_order !== oldSortOrder) {
        if (sort_order > oldSortOrder) {
          // Moving down: shift records between old and new position up by 1
          await JobColorColumnSections.decrement("sort_order", {
            by: 1,
            where: {
              job_color_settings_id: jobColorSettingsId,
              sort_order: { [Op.gt]: oldSortOrder, [Op.lte]: sort_order },
              job_color_column_section_id: { [Op.ne]: job_color_column_section_id },
            },
            transaction,
          });
        } else {
          // Moving up: shift records between new and old position down by 1
          await JobColorColumnSections.increment("sort_order", {
            by: 1,
            where: {
              job_color_settings_id: jobColorSettingsId,
              sort_order: { [Op.gte]: sort_order, [Op.lt]: oldSortOrder },
              job_color_column_section_id: { [Op.ne]: job_color_column_section_id },
            },
            transaction,
          });
        }
      }
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updatePayload = {};

    if (section_name) {
      updatePayload.section_name = section_name;
    }

    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }

    if (attachments !== undefined) {
      if (!attachments) {
        // Explicitly clearing the attachment
        updatePayload.attachments = null;
      } else {
        // Delete old S3 file if being replaced
        if (section.attachments && section.attachments !== attachments) {
          await deleteFromS3(section.attachments);
        }
        updatePayload.attachments = attachments;
      }
    }

    await section.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: keysToCamelCase(section.get({ plain: true })) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
