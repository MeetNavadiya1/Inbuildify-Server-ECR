import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

/* ---------------------------------
   GET ALL TEMPLATE NOTES
---------------------------------- */
export async function getAllTemplateNotesService({ builderId, queryParams }) {
  const { page = 1, limit = 25 } = queryParams;

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await db.TemplateNote.findAndCountAll({
    where: { builder_id: builderId },
    order: [["createdAt", "DESC"]],
    limit: limitValue,
    offset,
  });

  const totalPages = Math.ceil(count / limitValue);

  return {
    templateNotes: keysToCamelCase(rows.map(r => r.toJSON())),
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
}

/* ---------------------------------
   UPDATE TEMPLATE NOTE
---------------------------------- */
export async function updateTemplateNoteService({ id, builderId, userId, payload }) {
  const { name, content } = payload;

  const template = await db.TemplateNote.findOne({
    where: {
      template_note_id: id,
      builder_id: builderId,
    },
  });

  if (!template) {
    const error = new Error("Template note not found or unauthorized to update.");
    error.status = 404;
    throw error;
  }

  if (!template.is_active) {
    const error = new Error("Template note is inactive.");
    error.status = 404;
    throw error;
  }

  if (name) {
    const duplicate = await db.TemplateNote.findOne({
      where: {
        name: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("name")),
          name.trim().toLowerCase(),
        ),
        builder_id: builderId,
        template_note_id: { [Op.ne]: id },
      },
    });
    if (duplicate) {
      const error = new Error("A template note with this name already exists.");
      error.status = 400;
      throw error;
    }
  }

  const updateFields = {};
  if (name) {
    updateFields.name = name.trim();
  }
  if (content) {
    updateFields.content = content.trim();
  }

  updateFields.updated_by = userId;
  updateFields.updated_at = new Date();

  await template.update(updateFields);

  return keysToCamelCase(template.toJSON());
}

/* ---------------------------------
   UPDATE TEMPLATE NOTE IS ACTIVE
---------------------------------- */
export async function updateTemplateNoteIsActiveService({ id, builderId, companyId, userId }) {
  const orConditions = [];
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }

  if (orConditions.length === 0) {
    const error = new Error("Template note not found in your scope");
    error.status = 404;
    throw error;
  }

  const template = await db.TemplateNote.findOne({
    where: {
      template_note_id: id,
      [Op.or]: orConditions,
    },
  });

  if (!template) {
    const error = new Error("Template note not found in your scope");
    error.status = 404;
    throw error;
  }

  const newStatus = !template.is_active;

  await template.update({
    is_active: newStatus,
    updated_by: userId,
    updated_at: new Date(),
  });

  return {
    result: keysToCamelCase(template.toJSON()),
    newStatus,
  };
}

/* ---------------------------------
   CREATE TEMPLATE NOTE
---------------------------------- */
export async function createTemplateNoteService({ builderId, companyId, userId, payload }) {
  const { name, content, is_active } = payload;

  if (!name || name.trim() === "") {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }

  // Duplicate check
  const duplicate = await db.TemplateNote.findOne({
    where: {
      name: db.sequelize.where(
        db.sequelize.fn("LOWER", db.sequelize.col("name")),
        name.trim().toLowerCase(),
      ),
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ].filter(cond => Object.values(cond)[0] !== null),
    },
  });

  if (duplicate) {
    const error = new Error("A template note with this name already exists for this builder/company.");
    error.status = 400;
    throw error;
  }

  const template = await db.TemplateNote.create({
    company_id: companyId,
    builder_id: builderId,
    name: name.trim(),
    content: content || null,
    is_active: is_active ?? true,
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(template.toJSON());
}
