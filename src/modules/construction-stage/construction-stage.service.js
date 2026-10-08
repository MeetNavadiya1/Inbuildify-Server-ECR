import db from "../../config/database/models/postgre-models/index.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";

// export async function createConstructionStageService({
//     builderId,
//     companyId,
//     userId,
//     builder,
//     construction_type_id,
//     stage_name,
//     days,
//     sort_order,
//     site_image,
//     inspection,
//     bg_color,
//     font_color,
// }) {
//     const transaction = await db.sequelize.transaction();

//     try {
//         // ── 1. Validate builder if provided ───────────────────────────────────────
//         if (builder) {
//             const builderExists = await db.Builder.findOne({
//                 where: { builder_id: builder },
//                 attributes: ["builder_id"],
//                 transaction,
//             });

//             if (!builderExists) {
//                 const error = new Error("Invalid builder ID.");
//                 error.status = 400;
//                 throw error;
//             }
//         }

//         // ── 2. Validate construction_type_id belongs to company/builder ───────────
//         const constructionType = await db.ConstructionType.findOne({
//             where: {
//                 construction_type_id,
//                 [db.Sequelize.Op.or]: [
//                     ...(companyId ? [{ company_id: companyId }] : []),
//                     ...(builderId ? [{ builder_id: builderId }] : []),
//                 ],
//             },
//             attributes: ["construction_type_id"],
//             transaction,
//         });

//         if (!constructionType) {
//             const error = new Error("Invalid or unauthorized construction_type_id.");
//             error.status = 400;
//             throw error;
//         }

//         // ── 3. Check duplicate stage_name for this company/builder ────────────────
//         const duplicate = await db.ConstructionStage.findOne({
//             where: {
//                 stage_name,
//                 [db.Sequelize.Op.or]: [
//                     ...(companyId ? [{ company_id: companyId }] : []),
//                     ...(builderId ? [{ builder_id: builderId }] : []),
//                 ],
//             },
//             attributes: ["construction_stage"],
//             transaction,
//         });

//         if (duplicate) {
//             const error = new Error("Construction stage with this name already exists.");
//             error.status = 409;
//             throw error;
//         }

//         // ── 4. Validate inspection value ──────────────────────────────────────────
//         const validInspectionValues = ["not_required", "stage_start", "stage_completed"];
//         if (!validInspectionValues.includes(inspection)) {
//             const error = new Error("Invalid inspection value.");
//             error.status = 400;
//             throw error;
//         }

//         // ── 5. Resolve sort_order ─────────────────────────────────────────────────

//         const maxSortOrder = await db.ConstructionStage.max("sort_order", {
//             where: {
//                 construction_type_id,
//                 [db.Sequelize.Op.or]: [
//                     ...(companyId ? [{ company_id: companyId }] : []),
//                     ...(builderId ? [{ builder_id: builderId }] : []),
//                 ],
//             },
//             transaction,
//         });

//         const maxSort = maxSortOrder ?? 0;

//         if (sort_order === undefined || sort_order === null) {
//             sort_order = maxSort + 1;
//         } else {
//             if (sort_order < 1 || sort_order > maxSort + 1) {
//                 const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSort + 1}.`);
//                 error.status = 400;
//                 throw error;
//             }

//             // ── 6. Shift existing stages to make room ─────────────────────────────
//             if (sort_order <= maxSort) {
//                 await db.ConstructionStage.increment("sort_order", {
//                     by: 1,
//                     where: {
//                         construction_type_id,
//                         sort_order: { [db.Sequelize.Op.gte]: sort_order },
//                         [db.Sequelize.Op.or]: [
//                             ...(companyId ? [{ company_id: companyId }] : []),
//                             ...(builderId ? [{ builder_id: builderId }] : []),
//                         ],
//                     },
//                     transaction,
//                 });
//             }
//         }

//         // ── 7. Insert new construction stage ──────────────────────────────────────
//         const newStage = await db.ConstructionStage.create(
//             {
//                 company_id: companyId,
//                 builder_id: builderId,
//                 builder: builder || null,
//                 construction_type_id,
//                 stage_name,
//                 days,
//                 sort_order,
//                 site_image,
//                 inspection,
//                 bg_color: bg_color || null,
//                 font_color: font_color || null,
//                 created_by: userId,
//                 updated_by: userId,
//             },
//             { transaction }
//         );

//         // ── 8. Fetch full response with builder and construction_type details ──────
//         const fullRecord = await db.ConstructionStage.findOne({
//             where: { construction_stage: newStage.construction_stage },
//             attributes: [
//                 "construction_stage",
//                 "stage_name",
//                 "days",
//                 "sort_order",
//                 "site_image",
//                 "inspection",
//                 "bg_color",
//                 "font_color",
//                 "created_at",
//                 "updated_at",
//             ],
//             include: [
//                 {
//                     model: db.Builder,
//                     as: "builderDetail",
//                     attributes: [["builder_id", "id"], "name"],
//                     required: false,
//                 },
//                 {
//                     model: db.ConstructionType,
//                     as: "constructionType",
//                     attributes: [["construction_type_id", "id"], ["types_name", "name"]],
//                     required: false,
//                 },
//             ],
//             transaction,
//         });

//         await transaction.commit();

//         const plain = fullRecord.toJSON();

//         return {
//             construction_stage: plain.construction_stage,
//             stage_name: plain.stage_name,
//             days: plain.days,
//             sort_order: plain.sort_order,
//             site_image: plain.site_image,
//             inspection: plain.inspection,
//             bg_color: plain.bg_color,
//             font_color: plain.font_color,
//             created_at: plain.created_at,
//             updated_at: plain.updated_at,
//             builder: plain.builderDetail ?? null,       // ✅ builderDetail → builder
//             construction_type: plain.constructionType ?? null,    // ✅ constructionType → construction_type
//         };
//     } catch (error) {
//         await transaction.rollback();
//         throw error;
//     }
// }

export async function createConstructionStageService({
  builderId,
  companyId,
  userId,
  builder,
  construction_type_id,
  workflow_type = "CONSTRUCTION",
  stage_name,
  days,
  sort_order,
  site_image,
  inspection,
  bg_color,
  font_color,
  icon = null,
  status = "active",
}) {
  const transaction = await db.sequelize.transaction();

  const orConditions = [];
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : {};

  try {
    // ── 1. Validate builder if provided ───────────────────────────────────────
    if (builder) {
      const builderExists = await db.Builder.findOne({
        where: { builder_id: builder },
        attributes: ["builder_id"],
        transaction,
      });

      if (!builderExists) {
        const error = new Error("Invalid builder ID.");
        error.status = 400;
        throw error;
      }
    }

    // ── 2. Validate construction_type_id belongs to company/builder ───────────
    //     Optional: workflow-level stages (dynamic Stages system) are not tied
    //     to a specific construction type.
    if (construction_type_id) {
      const constructionType = await db.ConstructionType.findOne({
        where: { construction_type_id, ...orClause },
        attributes: ["construction_type_id"],
        transaction,
      });

      if (!constructionType) {
        const error = new Error("Invalid or unauthorized construction_type_id.");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Check duplicate stage_name for this company/builder ────────────────
    const duplicate = await db.ConstructionStage.findOne({
      where: { stage_name, ...orClause },
      attributes: ["construction_stage"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Construction stage with this name already exists.");
      error.status = 409;
      throw error;
    }

    // ── 4. Validate inspection value ──────────────────────────────────────────
    const validInspectionValues = ["not_required", "stage_start", "stage_completed"];
    if (!validInspectionValues.includes(inspection)) {
      const error = new Error("Invalid inspection value.");
      error.status = 400;
      throw error;
    }

    // ── 5. Resolve and validate sort_order ────────────────────────────────────
    //     Scope ordering to the same (construction_type, workflow_type) group.
    const sortScope = { construction_type_id: construction_type_id ?? null, workflow_type, ...orClause };

    const maxSortOrder = await db.ConstructionStage.max("sort_order", {
      where: sortScope,
      transaction,
    });

    const maxSort = maxSortOrder ?? 0;

    if (sort_order == null) {
      sort_order = maxSort + 1;
    }

    if (sort_order < 1 || sort_order > maxSort + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSort + 1}.`);
      error.status = 400;
      throw error;
    }

    // ── 6. Shift existing stages to make room ─────────────────────────────────
    if (sort_order <= maxSort) {
      await db.ConstructionStage.increment("sort_order", {
        by: 1,
        where: {
          ...sortScope,
          sort_order: { [db.Sequelize.Op.gte]: sort_order },
        },
        transaction,
      });
    }

    // ── 7. Insert new construction stage ──────────────────────────────────────
    const newStage = await db.ConstructionStage.create(
      {
        company_id: companyId,
        builder_id: builderId,
        builder: builder || null,
        construction_type_id: construction_type_id ?? null,
        workflow_type,
        stage_name,
        days,
        sort_order,
        site_image,
        inspection,
        bg_color: bg_color || null,
        font_color: font_color || null,
        icon: icon || null,
        status: status || "active",
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // ── 8. Fetch full response with builder and construction_type details ──────
    const fullRecord = await db.ConstructionStage.findOne({
      where: { construction_stage: newStage.construction_stage },
      attributes: STAGE_ATTRIBUTES,
      include: STAGE_INCLUDES(db),
      transaction,
    });

    await transaction.commit();

    return mapStage(fullRecord.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ── Shared shape helpers ───────────────────────────────────────────────────
const STAGE_ATTRIBUTES = [
  "construction_stage",
  "stage_name",
  "workflow_type",
  "days",
  "sort_order",
  "site_image",
  "inspection",
  "bg_color",
  "font_color",
  "icon",
  "status",
  "is_system",
  "construction_type_id",
  "created_at",
  "updated_at",
];

const STAGE_INCLUDES = (db) => [
  {
    model: db.Builder,
    as: "builderRef",
    attributes: [["builder_id", "id"], "name"],
    required: false,
  },
  {
    model: db.ConstructionType,
    as: "constructionType",
    attributes: [["construction_type_id", "id"], ["types_name", "name"]],
    required: false,
  },
];

function mapStage(plain) {
  return {
    construction_stage: plain.construction_stage,
    stage_name: plain.stage_name,
    workflow_type: plain.workflow_type,
    days: plain.days,
    sort_order: plain.sort_order,
    site_image: plain.site_image,
    inspection: plain.inspection,
    bg_color: plain.bg_color,
    font_color: plain.font_color,
    icon: plain.icon ?? null,
    status: plain.status,
    is_system: plain.is_system,
    construction_type_id: plain.construction_type_id ?? null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    builder: plain.builderRef ?? null,
    construction_type: plain.constructionType ?? null,
  };
}

export async function getAllConstructionStagesService({ loggedInBuilderId, builder, construction_type_id, workflow_type }) {
  // ── Build where clause ────────────────────────────────────────────────────
  const whereClause = builder
    ? { builder, builder_id: loggedInBuilderId }
    : { builder_id: loggedInBuilderId };

  if (construction_type_id) {
    whereClause.construction_type_id = construction_type_id;
  }

  if (workflow_type) {
    whereClause.workflow_type = workflow_type;
  }

  // ── Fetch all construction stages ─────────────────────────────────────────
  const stages = await db.ConstructionStage.findAll({
    where: whereClause,
    attributes: STAGE_ATTRIBUTES,
    include: STAGE_INCLUDES(db),
    order: [
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
  });

  return stages.map((stage) => mapStage(stage.toJSON()));
}

export async function updateConstructionStageService({
  builderId,
  companyId,
  userId,
  construction_stage,
  stage_name,
  workflow_type,
  days,
  sort_order,
  site_image,
  inspection,
  bg_color,
  font_color,
  icon,
  status,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists for this builder ───────────────────────────────
    const existing = await db.ConstructionStage.findOne({
      where: { construction_stage, builder_id: builderId },
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction stage not found or access denied.");
      error.status = 404;
      throw error;
    }

    const oldSortOrder = existing.sort_order;
    const constructionTypeId = existing.construction_type_id;

    // ── 2. Check duplicate stage_name (excluding current record) ──────────────
    if (stage_name) {
      const duplicate = await db.ConstructionStage.findOne({
        where: {
          stage_name,
          construction_stage: { [db.Sequelize.Op.ne]: construction_stage },
          [db.Sequelize.Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        attributes: ["construction_stage"],
        transaction,
      });

      if (duplicate) {
        const error = new Error("Construction stage with this name already exists.");
        error.status = 409;
        throw error;
      }
    }

    // ── 3. Validate and reorder sort_order if changed ─────────────────────────
    if (sort_order !== undefined) {
      const maxSortOrder = await db.ConstructionStage.max("sort_order", {
        where: {
          construction_type_id: constructionTypeId,
          [db.Sequelize.Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        transaction,
      });

      const maxSort = maxSortOrder ?? 0;

      if (sort_order < 1 || sort_order > maxSort + 1) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${maxSort + 1}.`);
        error.status = 400;
        throw error;
      }

      if (sort_order !== oldSortOrder) {
        if (sort_order > oldSortOrder) {
          // Moving down — shift records between old and new position up
          await db.ConstructionStage.increment("sort_order", {
            by: -1,
            where: {
              construction_type_id: constructionTypeId,
              sort_order: {
                [db.Sequelize.Op.gt]: oldSortOrder,
                [db.Sequelize.Op.lte]: sort_order,
              },
              construction_stage: { [db.Sequelize.Op.ne]: construction_stage },
              [db.Sequelize.Op.or]: [
                ...(companyId ? [{ company_id: companyId }] : []),
                ...(builderId ? [{ builder_id: builderId }] : []),
              ],
            },
            transaction,
          });
        } else {
          // Moving up — shift records between new and old position down
          await db.ConstructionStage.increment("sort_order", {
            by: 1,
            where: {
              construction_type_id: constructionTypeId,
              sort_order: {
                [db.Sequelize.Op.gte]: sort_order,
                [db.Sequelize.Op.lt]: oldSortOrder,
              },
              construction_stage: { [db.Sequelize.Op.ne]: construction_stage },
              [db.Sequelize.Op.or]: [
                ...(companyId ? [{ company_id: companyId }] : []),
                ...(builderId ? [{ builder_id: builderId }] : []),
              ],
            },
            transaction,
          });
        }
      }
    }

    // ── 4. Build update payload ───────────────────────────────────────────────
    const updatePayload = { updated_by: userId };
    if (stage_name !== undefined) {
      updatePayload.stage_name = stage_name;
    }
    if (workflow_type !== undefined) {
      updatePayload.workflow_type = workflow_type;
    }
    if (icon !== undefined) {
      updatePayload.icon = icon;
    }
    if (status !== undefined) {
      updatePayload.status = status;
    }
    if (days !== undefined) {
      updatePayload.days = days;
    }
    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }
    if (site_image !== undefined) {
      updatePayload.site_image = site_image;
    }
    if (inspection !== undefined) {
      updatePayload.inspection = inspection;
    }
    if (bg_color !== undefined) {
      updatePayload.bg_color = bg_color;
    }
    if (font_color !== undefined) {
      updatePayload.font_color = font_color;
    }

    if (Object.keys(updatePayload).length === 1) {
      const error = new Error("No fields provided to update.");
      error.status = 400;
      throw error;
    }

    await existing.update(updatePayload, { transaction });

    // ── 5. Fetch full response with builder and construction_type details ──────
    const fullRecord = await db.ConstructionStage.findOne({
      where: { construction_stage },
      attributes: STAGE_ATTRIBUTES,
      include: STAGE_INCLUDES(db),
      transaction,
    });

    await transaction.commit();

    return mapStage(fullRecord.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteConstructionStageService({ builderId, construction_stage }) {
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Check record exists for this builder ───────────────────────────────
    const existing = await db.ConstructionStage.findOne({
      where: { construction_stage, builder_id: builderId },
      attributes: ["construction_stage", "sort_order", "construction_type_id"],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction stage not found or access denied.");
      error.status = 404;
      throw error;
    }

    const deletedSortOrder = existing.sort_order;
    const constructionTypeId = existing.construction_type_id;

    // ── 2. Delete the record ──────────────────────────────────────────────────
    await existing.destroy({ transaction });

    // ── 3. Shift sort_order down for all records above deleted position ────────
    await db.ConstructionStage.increment("sort_order", {
      by: -1,
      where: {
        builder_id: builderId,
        construction_type_id: constructionTypeId,
        sort_order: { [db.Sequelize.Op.gt]: deletedSortOrder },
      },
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dynamic Stages system — workflow filtering, reorder, and per-job progress
// ─────────────────────────────────────────────────────────────────────────────

const VALID_JOB_STAGE_STATUSES = ["pending", "in_progress", "completed", "skipped"];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Ensure the job exists and belongs to the caller's tenant. */
async function assertJobInScope(jobId, { builderId, companyId }, transaction) {
  const job = await db.Job.findOne({
    where: { job_id: jobId, builder_id: builderId, ...(companyId ? { company_id: companyId } : {}) },
    transaction,
  });
  if (!job) throw httpError(404, "Job not found or does not belong to this builder.");
  return job;
}

function mapJobStage(plain) {
  return {
    job_construction_stage_id: plain.job_construction_stage_id,
    job_id: plain.job_id,
    construction_stage_id: plain.construction_stage_id ?? null,
    workflow_type: plain.workflow_type,
    stage_name: plain.stage_name,
    sort_order: plain.sort_order,
    bg_color: plain.bg_color,
    font_color: plain.font_color,
    icon: plain.icon ?? null,
    status: plain.status,
    completed_at: plain.completed_at ?? null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
  };
}

/**
 * Bulk reorder catalog stages. `items` = [{ construction_stage, sort_order }].
 * Only rows belonging to the caller's builder are updated.
 */
export async function reorderStagesService({ builderId, userId, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError(400, "items array is required.");
  }

  const transaction = await db.sequelize.transaction();
  try {
    for (const item of items) {
      const id = item.construction_stage;
      const sortOrder = item.sort_order;
      if (!id || sortOrder == null) continue;

      const [count] = await db.ConstructionStage.update(
        { sort_order: sortOrder, updated_by: userId },
        { where: { construction_stage: id, builder_id: builderId }, transaction },
      );

      if (count === 0) {
        throw httpError(404, `Construction stage ${id} not found or access denied.`);
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  // Return the affected stages in their new order.
  const ids = items.map((i) => i.construction_stage).filter(Boolean);
  const rows = await db.ConstructionStage.findAll({
    where: { construction_stage: { [db.Sequelize.Op.in]: ids }, builder_id: builderId },
    attributes: STAGE_ATTRIBUTES,
    include: STAGE_INCLUDES(db),
    order: [["sort_order", "ASC"]],
  });
  return rows.map((r) => mapStage(r.toJSON()));
}

/**
 * Initialize (snapshot) the catalog stages for a job's workflow into
 * job_construction_stage. Idempotent: existing job stages are not duplicated.
 */
export async function initializeJobStagesService({
  jobId,
  builderId,
  companyId,
  userId,
  workflow_type = "CONSTRUCTION",
}) {
  const transaction = await db.sequelize.transaction();
  try {
    await assertJobInScope(jobId, { builderId, companyId }, transaction);

    const catalog = await db.ConstructionStage.findAll({
      where: {
        builder_id: builderId,
        workflow_type,
        status: "active",
        construction_type_id: null,
      },
      order: [["sort_order", "ASC"]],
      transaction,
    });

    if (catalog.length === 0) {
      throw httpError(400, `No active ${workflow_type} stages found to initialize. Seed or create stages first.`);
    }

    for (const stage of catalog) {
      const s = stage.toJSON();
      await db.JobConstructionStage.findOrCreate({
        where: { job_id: jobId, construction_stage_id: s.construction_stage },
        defaults: {
          job_id: jobId,
          construction_stage_id: s.construction_stage,
          workflow_type: s.workflow_type,
          stage_name: s.stage_name,
          sort_order: s.sort_order,
          bg_color: s.bg_color,
          font_color: s.font_color,
          icon: s.icon,
          status: "pending",
          company_id: companyId,
          builder_id: builderId,
          created_by: userId,
          updated_by: userId,
        },
        transaction,
      });
    }

    await logJobActivity(transaction, {
      userId,
      jobId,
      module: "Construction",
      moduleId: jobId,
      recordName: workflow_type,
      action: "CREATE",
      description: `Initialized ${catalog.length} ${workflow_type} stage(s)`,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return getJobStagesService({ jobId, builderId, companyId, workflow_type });
}

/** Fetch a job's stage progress (optionally filtered by workflow). */
export async function getJobStagesService({ jobId, builderId, companyId, workflow_type }) {
  await assertJobInScope(jobId, { builderId, companyId });

  const where = { job_id: jobId };
  if (workflow_type) where.workflow_type = workflow_type;

  const rows = await db.JobConstructionStage.findAll({
    where,
    order: [
      ["workflow_type", "ASC"],
      ["sort_order", "ASC"],
    ],
  });

  return rows.map((r) => mapJobStage(r.toJSON()));
}

/** Update the status of a single job stage. */
export async function updateJobStageStatusService({
  jobId,
  jobConstructionStageId,
  status,
  builderId,
  companyId,
  userId,
}) {
  if (!VALID_JOB_STAGE_STATUSES.includes(status)) {
    throw httpError(400, `Invalid status. Allowed: ${VALID_JOB_STAGE_STATUSES.join(", ")}.`);
  }

  const transaction = await db.sequelize.transaction();
  try {
    await assertJobInScope(jobId, { builderId, companyId }, transaction);

    const row = await db.JobConstructionStage.findOne({
      where: { job_construction_stage_id: jobConstructionStageId, job_id: jobId },
      transaction,
    });

    if (!row) {
      throw httpError(404, "Job construction stage not found for this job.");
    }

    await row.update(
      {
        status,
        completed_at: status === "completed" ? new Date() : null,
        updated_by: userId,
      },
      { transaction },
    );

    await logJobActivity(transaction, {
      userId,
      jobId,
      module: "Construction",
      moduleId: jobConstructionStageId,
      recordName: row.stage_name || "Construction Stage",
      action: "UPDATE",
      fieldName: "status",
      newValue: status,
      description: `Construction stage "${row.stage_name || ""}" marked ${status}`,
    });

    await transaction.commit();
    return mapJobStage(row.toJSON());
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
