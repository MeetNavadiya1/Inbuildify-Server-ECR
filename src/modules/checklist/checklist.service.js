import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

export async function getAllChecklistService({ builderId, page, limit }) {
  const offset = (page - 1) * limit;

  const { rows: checklists, count: totalRecords } = await db.Checklist.findAndCountAll({
    where: { builder_id: builderId, is_deleted: false },
    attributes: ["checklist_id", "name", "is_active"],
    include: [
      {
        model: db.Screen,
        as: "screen",
        attributes: [["screen_id", "id"], "name"],
        required: false,
      },
      {
        model: db.Functionality,
        as: "functionality",
        attributes: [["functionality_id", "id"], "name"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    checklist: keysToCamelCase(checklists.map((c) => c.toJSON())),
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords,
      limit,
    },
  };
}

export async function createChecklistService({
  name,
  screen_id,
  functionality_id,
  is_active,
  createdBy,
  builderId,
}) {
  const transaction = await db.sequelize.transaction();

  try {
    const trimmedName = name.trim();

    // ── Check screen exists ───────────────────────────────
    const screen = await db.Screen.findByPk(screen_id, { transaction });

    if (!screen) {
      throw { status: 404, message: "Screen not found." };
    }

    // ── Check functionality exists ───────────────────────
    const functionality = await db.Functionality.findByPk(functionality_id, {
      transaction,
    });

    if (!functionality) {
      throw { status: 404, message: "Functionality not found." };
    }

    // ── Duplicate check (ignore soft deleted) ─────────────
    const existingChecklist = await db.Checklist.findOne({
      where: {
        functionality_id,
        builder_id: builderId,
        name: trimmedName,
        is_deleted: false,
      },
      attributes: ["checklist_id"],
      transaction,
    });

    if (existingChecklist) {
      throw {
        status: 409,
        message:
          "Functionality with this name already exists for this screen.",
      };
    }

    // ── Create checklist ─────────────────────────────────
    const checklist = await db.Checklist.create(
      {
        builder_id: builderId,
        name: trimmedName,
        screen_id,
        functionality_id,
        is_active: is_active ?? true,
        created_by: createdBy,
        updated_by: createdBy,
      },
      { transaction },
    );

    // ── Fetch with associations (FIXED alias issue) ──────
    const result = await db.Checklist.findOne({
      where: { checklist_id: checklist.checklist_id },
      attributes: ["checklist_id", "name", "is_active"],
      include: [
        {
          model: db.Screen,
          as: "screen", // ✅ alias must match model
          attributes: [["screen_id", "id"], ["name", "name"]],
        },
        {
          model: db.Functionality,
          as: "functionality", // ✅ alias must match model
          attributes: [["functionality_id", "id"], ["name", "name"]],
        },
      ],
      transaction,
    });

    await transaction.commit();

    // ── Clean response format ─────────────────────────────
    return {
      checklistId: result.checklist_id,
      name: result.name,
      isActive: result.is_active,
      screen: result.screen,
      functionality: result.functionality,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateChecklistService({ checklistId, builderId, userId, payload }) {
  const { name, functionality_id, screen_id } = payload;

  // ── At least one field required ─────────────────────────────────────────────
  if (name === undefined && functionality_id === undefined && screen_id === undefined) {
    const error = new Error("No fields provided for update.");
    error.status = 400;
    throw error;
  }

  // ── Check checklist exists and is not deleted ───────────────────────────────
  const existing = await db.Checklist.findOne({
    where: { checklist_id: checklistId, builder_id: builderId, is_deleted: false },
  });

  if (!existing) {
    const error = new Error("Checklist not found or access denied.");
    error.status = 404;
    throw error;
  }

  // ── Check checklist is active ───────────────────────────────────────────────
  if (!existing.is_active) {
    const error = new Error("Checklist is inactive.");
    error.status = 400;
    throw error;
  }

  // ── Validate screen_id ──────────────────────────────────────────────────────
  if (screen_id) {
    const validScreen = await db.Screen.findOne({
      where: { screen_id },
      attributes: ["screen_id"],
    });

    if (!validScreen) {
      const error = new Error("Invalid screenId or screen not found.");
      error.status = 400;
      throw error;
    }
  }

  // ── Validate functionality_id ───────────────────────────────────────────────
  if (functionality_id) {
    const validFunc = await db.Functionality.findOne({
      where: { functionality_id },
      attributes: ["functionality_id"],
    });

    if (!validFunc) {
      const error = new Error("Invalid functionalityId or functionality not found.");
      error.status = 400;
      throw error;
    }
  }

  // ── Duplicate name check ────────────────────────────────────────────────────
  if (name || functionality_id) {
    const duplicate = await db.Checklist.findOne({
      where: {
        functionality_id: functionality_id || existing.functionality_id,
        name: name || existing.name,
        checklist_id: { [Op.ne]: checklistId },
        builder_id: builderId,
      },
      attributes: ["checklist_id"],
    });

    if (duplicate) {
      const error = new Error("checklist with this name already exists for this functionality.");
      error.status = 409;
      throw error;
    }
  }

  // ── Build update payload ────────────────────────────────────────────────────
  const updatePayload = { updated_by: userId };

  if (name !== undefined) {
    updatePayload.name = name;
  }
  if (functionality_id !== undefined) {
    updatePayload.functionality_id = functionality_id;
  }
  if (screen_id !== undefined) {
    updatePayload.screen_id = screen_id;
  }

  await db.Checklist.update(updatePayload, {
    where: { checklist_id: checklistId, builder_id: builderId },
  });

  // ── Fetch updated record with screen + functionality ────────────────────────
  const updated = await db.Checklist.findOne({
    where: { checklist_id: checklistId, builder_id: builderId },
    attributes: ["checklist_id", "name", "is_active"],
    include: [
      {
        model: db.Screen,
        as: "screen",
        attributes: [["screen_id", "id"], "name"],
      },
      {
        model: db.Functionality,
        as: "functionality",
        attributes: [["functionality_id", "id"], "name"],
      },
    ],
  });

  return keysToCamelCase(updated.toJSON());
}

export async function updateChecklistIsActiveService({ checklistId, builderId, userId }) {
  // ── Check checklist exists for this builder ─────────────────────────────────
  const existing = await db.Checklist.findOne({
    where: { checklist_id: checklistId, builder_id: builderId, is_deleted: false },
    attributes: ["checklist_id", "is_active"],
  });

  if (!existing) {
    const error = new Error("Checklist not found for this builder");
    error.status = 404;
    throw error;
  }

  // ── Toggle is_active ────────────────────────────────────────────────────────
  const newIsActive = !existing.is_active;

  const [, [updated]] = await db.Checklist.update(
    { is_active: newIsActive, updated_by: userId },
    {
      where: { checklist_id: checklistId },
      returning: ["checklist_id", "is_active"],
    },
  );

  return keysToCamelCase(updated.toJSON());
}

export async function deleteChecklistService({ checklist_id, builderId, userId }) {
  // ── Check checklist exists for this builder and is not already deleted ──────
  const existing = await db.Checklist.findOne({
    where: {
      checklist_id,
      builder_id: builderId,
      is_deleted: false,
    },
    attributes: ["checklist_id"],
  });

  if (!existing) {
    const error = new Error("Checklist not found or access denied.");
    error.status = 404;
    throw error;
  }

  // ── Soft delete checklist ────────────────────────────────────────────────────
  await db.Checklist.update(
    {
      is_deleted: true,
      updated_by: userId,
      updatedAt: new Date(),
    },
    {
      where: {
        checklist_id,
        builder_id: builderId,
      },
    },

  );
}
