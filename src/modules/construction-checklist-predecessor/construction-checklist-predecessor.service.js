import db from "../../config/database/models/postgre-models/index.js";

/**
 * Helper to fetch a predecessor record with names and aliased fields.
 */
async function fetchPredecessorWithDetails(id, transaction) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;

  const record = await ConstructionChecklistPredecessor.findOne({
    where: { construction_checklist_predecessor_id: id },
    attributes: [
      "construction_checklist_predecessor_id",
      "construction_checklist_id",
      "predecessor_checklist_id",
      ["off_set", "offset"],
      "duration",
      "createdAt",
      "updatedAt",
    ],
    include: [
      {
        model: ConstructionChecklist,
        as: "predecessorChecklist",
        attributes: ["name"],
        required: false,
      },
    ],
    transaction,
  });

  if (!record) return null;

  const plain = record.toJSON();
  return {
    ...plain,
    predecessor_checklist_name: plain.predecessorChecklist?.name ?? null,
    predecessorChecklist: undefined, // cleaning up nested key
  };
}

export async function createPredecessorService({
  construction_checklist_id,
  predecessor_checklist_id,
  offset,
  duration,
  builderId,
  companyId,
}) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    // ── 1. Validate construction_checklist_id ────────────────────────────────
    const checklist = await ConstructionChecklist.findOne({
      where: {
        construction_checklist_id,
        builder_id: builderId,
        company_id: companyId,
      },
      attributes: ["construction_checklist_id"],
      transaction,
    });

    if (!checklist) {
      const error = new Error("Invalid construction_checklist_id or access denied");
      error.status = 400;
      throw error;
    }

    // ── 2. Validate predecessor_checklist_id ─────────────────────────────────
    if (predecessor_checklist_id) {
      const predecessor = await ConstructionChecklist.findOne({
        where: {
          construction_checklist_id: predecessor_checklist_id,
          builder_id: builderId,
          company_id: companyId,
        },
        attributes: ["construction_checklist_id"],
        transaction,
      });

      if (!predecessor) {
        const error = new Error("Invalid predecessor_checklist_id or access denied");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Check for duplicates ──────────────────────────────────────────────
    const existing = await ConstructionChecklistPredecessor.findOne({
      where: {
        construction_checklist_id,
        predecessor_checklist_id: predecessor_checklist_id || null,
      },
      attributes: ["construction_checklist_predecessor_id"],
      transaction,
    });

    if (existing) {
      const error = new Error("Predecessor relationship already exists for this checklist");
      error.status = 400;
      throw error;
    }

    // ── 4. Create record ─────────────────────────────────────────────────────
    const newRecord = await ConstructionChecklistPredecessor.create(
      {
        construction_checklist_id,
        predecessor_checklist_id: predecessor_checklist_id || null,
        off_set: offset !== undefined ? offset : false,
        duration: duration !== undefined ? duration : 0,
      },
      { transaction },
    );

    // ── 5. Fetch full detailed response ──────────────────────────────────────
    const result = await fetchPredecessorWithDetails(newRecord.construction_checklist_predecessor_id, transaction);

    await transaction.commit();

    return {
      ...result,
      created_at: null, // Parity requirement
      updated_at: null, // Parity requirement
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllPredecessorsService({
  construction_checklist_id,
  predecessor_checklist_id,
  offset,
  duration,
  builderId,
  companyId,
}) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;

  const whereClause = {};
  if (construction_checklist_id) whereClause.construction_checklist_id = construction_checklist_id;
  if (predecessor_checklist_id) whereClause.predecessor_checklist_id = predecessor_checklist_id;
  if (offset !== undefined) whereClause.off_set = offset === "true";
  if (duration !== undefined) whereClause.duration = parseInt(duration, 10);

  const predecessors = await ConstructionChecklistPredecessor.findAll({
    where: whereClause,
    attributes: [
      "construction_checklist_predecessor_id",
      "construction_checklist_id",
      "predecessor_checklist_id",
      ["off_set", "offset"],
      "duration",
      "createdAt",
      "updatedAt",
    ],
    include: [
      {
        model: ConstructionChecklist,
        as: "constructionChecklist",
        attributes: ["sort_order"],
        where: { builder_id: builderId, company_id: companyId },
        required: true,
      },
      {
        model: ConstructionChecklist,
        as: "predecessorChecklist",
        attributes: ["name", "sort_order"],
        required: false,
      },
    ],
    order: [
      [{ model: ConstructionChecklist, as: "constructionChecklist" }, "sort_order", "ASC"],
      [{ model: ConstructionChecklist, as: "predecessorChecklist" }, "sort_order", "ASC"],
      ["createdAt", "DESC"],
    ],
  });

  return predecessors.map((p) => {
    const plain = p.toJSON();
    return {
      ...plain,
      predecessor_checklist_name: plain.predecessorChecklist?.name ?? null,
      constructionChecklist: undefined,
      predecessorChecklist: undefined,
    };
  });
}

export async function getPredecessorByIdService({
  construction_checklist_predecessor_id,
  builderId,
  companyId,
}) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;

  const record = await ConstructionChecklistPredecessor.findOne({
    where: { construction_checklist_predecessor_id },
    attributes: [
      "construction_checklist_predecessor_id",
      ["construction_checklist_id", "construction_checklist"],
      "predecessor_checklist_id",
      ["off_set", "offset"],
      "duration",
      "createdAt",
      "updatedAt",
    ],
    include: [
      {
        model: ConstructionChecklist,
        as: "constructionChecklist",
        attributes: [],
        where: { builder_id: builderId, company_id: companyId },
        required: true,
      },
      {
        model: ConstructionChecklist,
        as: "predecessorChecklist",
        attributes: ["name"],
        required: false,
      },
    ],
  });

  if (!record) {
    const error = new Error("Construction checklist predecessor not found or access denied.");
    error.status = 404;
    throw error;
  }

  const plain = record.toJSON();
  return {
    ...plain,
    predecessor_checklist_name: plain.predecessorChecklist?.name ?? null,
    predecessorChecklist: undefined,
  };
}

export async function updatePredecessorService({
  construction_checklist_predecessor_id,
  predecessor_checklist_id,
  offset,
  duration,
  builderId,
  companyId,
}) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const existing = await ConstructionChecklistPredecessor.findOne({
      where: { construction_checklist_predecessor_id },
      include: [
        {
          model: ConstructionChecklist,
          as: "constructionChecklist",
          attributes: ["builder_id", "company_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction checklist predecessor not found.");
      error.status = 404;
      throw error;
    }

    if (
      existing.constructionChecklist.builder_id !== builderId ||
      existing.constructionChecklist.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only update your own records.");
      error.status = 403;
      throw error;
    }

    if (predecessor_checklist_id !== undefined) {
      if (predecessor_checklist_id) {
        const predecessor = await ConstructionChecklist.findOne({
          where: {
            construction_checklist_id: predecessor_checklist_id,
            builder_id: builderId,
            company_id: companyId,
          },
          attributes: ["construction_checklist_id"],
          transaction,
        });

        if (!predecessor) {
          const error = new Error("Invalid predecessor_checklist_id or access denied");
          error.status = 400;
          throw error;
        }
      }
    }

    const updatePayload = {};
    if (predecessor_checklist_id !== undefined) updatePayload.predecessor_checklist_id = predecessor_checklist_id || null;
    if (offset !== undefined) updatePayload.off_set = offset;
    if (duration !== undefined) updatePayload.duration = duration;

    if (Object.keys(updatePayload).length === 0) {
      const error = new Error("At least one field is required for update.");
      error.status = 400;
      throw error;
    }

    await existing.update(updatePayload, { transaction });

    const result = await fetchPredecessorWithDetails(construction_checklist_predecessor_id, transaction);

    await transaction.commit();
    return {
      ...result,
      created_at: null, // Parity requirement
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deletePredecessorService({
  construction_checklist_predecessor_id,
  builderId,
  companyId,
}) {
  const { ConstructionChecklistPredecessor, ConstructionChecklist } = db;
  const transaction = await db.sequelize.transaction();

  try {
    const existing = await ConstructionChecklistPredecessor.findOne({
      where: { construction_checklist_predecessor_id },
      include: [
        {
          model: ConstructionChecklist,
          as: "constructionChecklist",
          attributes: ["builder_id", "company_id"],
          required: true,
        },
      ],
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction checklist predecessor not found.");
      error.status = 404;
      throw error;
    }

    if (
      existing.constructionChecklist.builder_id !== builderId ||
      existing.constructionChecklist.company_id !== companyId
    ) {
      const error = new Error("Access denied - you can only delete your own records.");
      error.status = 403;
      throw error;
    }

    await existing.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
