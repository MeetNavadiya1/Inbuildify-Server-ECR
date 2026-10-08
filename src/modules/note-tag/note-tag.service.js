import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

export async function getAllNoteTagService({ builderId, page, limit }) {
  const offset = (page - 1) * limit;

  const { rows: noteTags, count: totalRecords } = await db.NotesTag.findAndCountAll({
    where: { builder_id: builderId },
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    noteTag: keysToCamelCase(noteTags.map((tag) => tag.toJSON())),
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords,
      limit,
    },
  };
}

export async function createNotesTagService({ builderId, companyId, userId, payload }) {
  const { name, background_color, font_color, is_active } = payload;

  // ── Duplicate name check ────────────────────────────────────────────────────
  const duplicate = await db.NotesTag.findOne({
    where: {
      company_id: companyId,
      builder_id: builderId,
      name: db.sequelize.where(
        db.sequelize.fn("LOWER", db.sequelize.col("name")),
        name.trim().toLowerCase(),
      ),
    },
    attributes: ["notes_tag_id"],
  });

  if (duplicate) {
    const error = new Error("Tag name already exists.");
    error.status = 400;
    throw error;
  }

  // ── Insert notes tag ────────────────────────────────────────────────────────
  const newTag = await db.NotesTag.create({
    company_id: companyId,
    builder_id: builderId,
    name: name.trim(),
    background_color: background_color || null,
    font_color: font_color || null,
    is_active: is_active ?? true,
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(newTag.toJSON());
}

export async function updateNoteTagService({ id, builderId, companyId, userId, payload }) {
  const { name, background_color, font_color } = payload;

  // ── Check note tag exists for this builder ──────────────────────────────────
  const existing = await db.NotesTag.findOne({
    where: { notes_tag_id: id, builder_id: builderId },
  });

  if (!existing) {
    const error = new Error("Note tag not found for this builder.");
    error.status = 404;
    throw error;
  }

  // ── Check note tag is active ────────────────────────────────────────────────
  if (!existing.is_active) {
    const error = new Error("Inactive note tag.");
    error.status = 404;
    throw error;
  }

  // ── Duplicate name check ────────────────────────────────────────────────────
  if (name) {
    const duplicate = await db.NotesTag.findOne({
      where: {
        name,
        notes_tag_id: { [Op.ne]: id },
        [Op.or]: [
          { company_id: companyId },
          { builder_id: builderId },
        ],
      },
      attributes: ["notes_tag_id"],
    });

    if (duplicate) {
      const error = new Error("Name already exists, please choose another name");
      error.status = 400;
      throw error;
    }
  }

  // ── Update note tag (COALESCE — only provided fields) ───────────────────────
  const [, [updated]] = await db.NotesTag.update(
    {
      name: name || existing.name,
      background_color: background_color || existing.background_color,
      font_color: font_color || existing.font_color,
      updated_by: userId,
    },
    { where: { notes_tag_id: id }, returning: true },
  );

  return keysToCamelCase(updated.toJSON());
}

export async function updateNoteTagIsActiveService({ id, builderId, userId, is_active }) {
  // ── Check note tag exists for this builder ──────────────────────────────────
  const existing = await db.NotesTag.findOne({
    where: { notes_tag_id: id, builder_id: builderId },
    attributes: ["notes_tag_id"],
  });

  if (!existing) {
    const error = new Error("note tag not found for this builder");
    error.status = 404;
    throw error;
  }

  // ── Update is_active ────────────────────────────────────────────────────────
  const [, [updated]] = await db.NotesTag.update(
    { is_active, updated_by: userId },
    { where: { notes_tag_id: id }, returning: true },
  );

  return keysToCamelCase(updated.toJSON());
}

export async function deleteNoteTagService({ id, builderId }) {
  // ── Check note tag exists for this builder ──────────────────────────────────
  const existing = await db.NotesTag.findOne({
    where: { notes_tag_id: id, builder_id: builderId },
    attributes: ["notes_tag_id"],
  });

  if (!existing) {
    const error = new Error("Note tag not found for this builder.");
    error.status = 404;
    throw error;
  }

  // ── Delete note tag ─────────────────────────────────────────────────────────
  await db.NotesTag.destroy({
    where: { notes_tag_id: id },
  });
}
