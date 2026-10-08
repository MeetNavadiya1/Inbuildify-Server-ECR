import db from "../../config/database/models/postgre-models/index.js";

export async function createConstructionInspectionChecklistService({
  userId,
  companyId,
  builderId,
  builder,
  construction_type_id,
  construction_stage_id,
  field_name,
  description,
  sort_order,
  construction_option_id,
  section_id,
  add_all_existing_jobs,
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
    if (field_name === "section") {
      // ── 1. Resolve and validate sort_order ───────────────────────────────────
      const maxSortOrder = await db.ConstructionInspectionChecklist.max("sort_order", {
        where: {
          field_name: "section",
          builder,
          construction_type_id,
          construction_stage_id,
          ...orClause,
        },
        transaction,
      });

      const max = (maxSortOrder == null || isNaN(maxSortOrder)) ? 0 : Number(maxSortOrder);

      const parsedSortOrder = (sort_order === undefined || sort_order === null || sort_order === "") ? max + 1 : Number(sort_order);

      if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > max + 1) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
        error.status = 400;
        throw error;
      }

      sort_order = parsedSortOrder;

      // ── 2. Shift existing sections to make room ───────────────────────────────
      if (sort_order <= max) {
        await db.ConstructionInspectionChecklist.increment("sort_order", {
          by: 1,
          where: {
            field_name: "section",
            builder,
            construction_type_id,
            construction_stage_id,
            sort_order: { [db.Sequelize.Op.gte]: sort_order },
            ...orClause,
          },
          transaction,
        });
      }

    } else if (field_name === "checklist") {
      // ── 3. Validate section_id if provided ───────────────────────────────────
      if (section_id) {
        const section = await db.ConstructionInspectionChecklist.findOne({
          where: {
            construction_inspection_checklist_id: section_id,
            field_name: "section",
            ...orClause,
          },
          attributes: ["construction_inspection_checklist_id"],
          transaction,
        });

        if (!section) {
          const error = new Error("Section not found or access denied");
          error.status = 400;
          throw error;
        }
      } else {
        // ── 4. Check at least one section exists ──────────────────────────────
        const sectionExists = await db.ConstructionInspectionChecklist.findOne({
          where: { field_name: "section", ...orClause },
          attributes: ["construction_inspection_checklist_id"],
          transaction,
        });

        if (!sectionExists) {
          const error = new Error("Cannot create checklist. No sections found. Please create a section first.");
          error.status = 400;
          throw error;
        }
      }

      // ── 5. Check duplicate description in same section ────────────────────────
      if (section_id) {
        const duplicate = await db.ConstructionInspectionChecklist.findOne({
          where: {
            section_id,
            description: db.sequelize.where(
              db.sequelize.fn("LOWER", db.sequelize.col("description")),
              db.sequelize.fn("LOWER", description.trim()),
            ),
            ...orClause,
          },
          attributes: ["construction_inspection_checklist_id"],
          transaction,
        });

        if (duplicate) {
          const error = new Error("Checklist with this name already exists in this section");
          error.status = 400;
          throw error;
        }
      }

      // ── 6. Resolve and validate sort_order ───────────────────────────────────
      const checklistWhere = {
        field_name: "checklist",
        section_id: section_id || null, // Scope to specific section or null
        ...orClause,
      };
      if (builder) {
        checklistWhere.builder = builder;
      }
      if (construction_type_id) {
        checklistWhere.construction_type_id = construction_type_id;
      }
      if (construction_stage_id) {
        checklistWhere.construction_stage_id = construction_stage_id;
      }

      const maxSortOrder = await db.ConstructionInspectionChecklist.max("sort_order", {
        where: checklistWhere,
        transaction,
      });

      const max = (maxSortOrder == null || isNaN(maxSortOrder)) ? 0 : Number(maxSortOrder);

      const parsedSortOrder = (sort_order === undefined || sort_order === null || sort_order === "") ? max + 1 : Number(sort_order);

      if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > max + 1) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
        error.status = 400;
        throw error;
      }

      sort_order = parsedSortOrder;

      // ── 7. Shift existing checklists to make room ─────────────────────────────
      if (sort_order <= max) {
        await db.ConstructionInspectionChecklist.increment("sort_order", {
          by: 1,
          where: {
            ...checklistWhere,
            sort_order: { [db.Sequelize.Op.gte]: sort_order },
          },
          transaction,
        });
      }
    }

    // ── 8. Insert new record ──────────────────────────────────────────────────
    const newRecord = await db.ConstructionInspectionChecklist.create(
      {
        company_id: companyId || null,
        builder_id: builderId || null,
        builder: builder || null,
        construction_type_id: construction_type_id || null,
        construction_stage_id: construction_stage_id || null,
        field_name,
        description,
        sort_order,
        construction_option_id: construction_option_id || null,
        section_id: section_id || null,
        add_all_existing_jobs: add_all_existing_jobs !== undefined ? add_all_existing_jobs : true,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // ── 9. Fetch full response ────────────────────────────────────────────────
    const fullRecord = await db.ConstructionInspectionChecklist.findOne({
      where: { construction_inspection_checklist_id: newRecord.construction_inspection_checklist_id },
      attributes: [
        "construction_inspection_checklist_id",
        "field_name",
        "description",
        "sort_order",
        "add_all_existing_jobs",
        "construction_option_id",
        "created_at",
        "updated_at",
      ],
      include: [
        { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
        { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
        { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
        { model: db.ConstructionInspectionChecklist, as: "section", attributes: [["construction_inspection_checklist_id", "id"], "description"], required: false },
      ],
      transaction,
    });

    await transaction.commit();

    const plain = fullRecord.toJSON();

    return {
      construction_inspection_checklist_id: plain.construction_inspection_checklist_id,
      field_name: plain.field_name,
      description: plain.description,
      sort_order: plain.sort_order,
      add_all_existing_jobs: plain.add_all_existing_jobs,
      construction_option_id: plain.construction_option_id,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
      builder: plain.builderRef ?? null,
      construction_type: plain.constructionType ?? null,
      construction_stage: plain.constructionStage ?? null,
      section: plain.section ?? null,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getConstructionInspectionChecklistsService({
  companyId, builderId, construction_type_id, construction_stage_id, builder, field_name,
}) {
  const whereClause = {};

  if (companyId) {
    whereClause.company_id = companyId;
  }
  if (builderId) {
    whereClause.builder_id = builderId;
  }
  if (builder) {
    whereClause.builder = builder;
  }
  if (construction_type_id) {
    whereClause.construction_type_id = construction_type_id;
  }
  if (construction_stage_id) {
    whereClause.construction_stage_id = construction_stage_id;
  }
  if (field_name) {
    whereClause.field_name = field_name;
  }

  const records = await db.ConstructionInspectionChecklist.findAll({
    where: whereClause,
    attributes: [
      "construction_inspection_checklist_id", "field_name", "description",
      "sort_order", "add_all_existing_jobs", "construction_option_id",
      "created_at", "updated_at",
    ],
    include: [
      { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
      { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
      { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
      { model: db.ConstructionInspectionChecklist, as: "section", attributes: [["construction_inspection_checklist_id", "id"], "description"], required: false },
    ],
    order: [["sort_order", "ASC"], ["created_at", "ASC"]],
  });

  return records.map((r) => {
    const plain = r.toJSON();
    return {
      construction_inspection_checklist_id: plain.construction_inspection_checklist_id,
      field_name: plain.field_name,
      description: plain.description,
      sort_order: plain.sort_order,
      add_all_existing_jobs: plain.add_all_existing_jobs,
      construction_option_id: plain.construction_option_id,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
      builder: plain.builderRef ?? null,
      construction_type: plain.constructionType ?? null,
      construction_stage: plain.constructionStage ?? null,
      section: plain.section ?? null,
    };
  });
}

export async function updateConstructionInspectionChecklistService({
  id, userId, companyId, builderId, builder, construction_type_id,
  construction_stage_id, field_name, description, sort_order,
  construction_option_id, section_id, add_all_existing_jobs, body,
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
    // ── 1. Check record exists ────────────────────────────────────────────────
    const existing = await db.ConstructionInspectionChecklist.findOne({
      where: { construction_inspection_checklist_id: id, ...orClause },
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction inspection checklist not found or access denied");
      error.status = 404;
      throw error;
    }

    const existingData = existing.toJSON();
    const updatedFieldName = field_name !== undefined ? field_name : existingData.field_name;

    // ── 2. Validate field_name = checklist section logic ──────────────────────
    if (updatedFieldName === "checklist") {
      if (section_id !== undefined) {
        if (section_id) {
          const section = await db.ConstructionInspectionChecklist.findOne({
            where: { construction_inspection_checklist_id: section_id, field_name: "section", ...orClause },
            attributes: ["construction_inspection_checklist_id"],
            transaction,
          });
          if (!section) {
            const e = new Error("Section not found or access denied"); e.status = 400; throw e;
          }
        } else {
          const sectionExists = await db.ConstructionInspectionChecklist.findOne({
            where: { field_name: "section", ...orClause },
            attributes: ["construction_inspection_checklist_id"],
            transaction,
          });
          if (!sectionExists) {
            const e = new Error("Cannot create checklist. No sections found. Please create a section first."); e.status = 400; throw e;
          }
        }
      } else if (!existingData.section_id) {
        const sectionExists = await db.ConstructionInspectionChecklist.findOne({
          where: { field_name: "section", ...orClause },
          attributes: ["construction_inspection_checklist_id"],
          transaction,
        });
        if (!sectionExists) {
          const e = new Error("Cannot create checklist. No sections found. Please create a section first."); e.status = 400; throw e;
        }
      }
    }

    // ── 3. Validate field_name = section allowed fields ───────────────────────
    if (updatedFieldName === "section") {
      const allowedSectionFields = [
        "builder", "construction_type_id", "construction_stage_id",
        "field_name", "description", "sort_order", "add_all_existing_jobs",
      ];
      for (const field of Object.keys(body)) {
        if (!allowedSectionFields.includes(field) && body[field] !== undefined) {
          const e = new Error(`Field '${field}' is not allowed when field_name is 'section'. Only allowed fields: ${allowedSectionFields.join(", ")}`);
          e.status = 400;
          throw e;
        }
      }
      if (builder !== undefined && !builder) {
        const e = new Error("builder is required when field_name is 'section'"); e.status = 400; throw e;
      }
      if (construction_type_id !== undefined && !construction_type_id) {
        const e = new Error("construction_type_id is required when field_name is 'section'"); e.status = 400; throw e;
      }
      if (construction_stage_id !== undefined && !construction_stage_id) {
        const e = new Error("construction_stage_id is required when field_name is 'section'"); e.status = 400; throw e;
      }
    }

    // ── 4. Validate and shift sort_order if changed ───────────────────────────
    if (sort_order !== undefined && sort_order !== existingData.sort_order) {
      if (updatedFieldName === "section") {
        const finalBuilder = builder !== undefined ? builder : existingData.builder;
        const finalTypeId = construction_type_id !== undefined ? construction_type_id : existingData.construction_type_id;
        const finalStageId = construction_stage_id !== undefined ? construction_stage_id : existingData.construction_stage_id;

        const sectionMaxRaw = await db.ConstructionInspectionChecklist.max("sort_order", {
          where: {
            field_name: "section",
            builder: finalBuilder,
            construction_type_id: finalTypeId,
            construction_stage_id: finalStageId,
            ...orClause,
          },
          transaction,
        });

        const sectionMax = (sectionMaxRaw == null || isNaN(sectionMaxRaw)) ? 0 : Number(sectionMaxRaw);
        const parsedSortOrder = Number(sort_order);

        if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > sectionMax) {
          const e = new Error(`Invalid sort_order. Allowed range is 1 to ${sectionMax}.`);
          e.status = 400;
          throw e;
        }

        sort_order = parsedSortOrder;

        await db.ConstructionInspectionChecklist.increment("sort_order", {
          by: 1,
          where: {
            field_name: "section",
            builder: finalBuilder,
            construction_type_id: finalTypeId,
            construction_stage_id: finalStageId,
            sort_order: { [db.Sequelize.Op.gte]: sort_order },
            construction_inspection_checklist_id: { [db.Sequelize.Op.ne]: id },
            ...orClause,
          },
          transaction,
        });

      } else if (updatedFieldName === "checklist") {
        const checklistWhere = {
          field_name: "checklist",
          section_id: section_id !== undefined ? section_id : existingData.section_id,
          ...orClause,
        };
        if (builder) {
          checklistWhere.builder = builder;
        }
        if (construction_type_id) {
          checklistWhere.construction_type_id = construction_type_id;
        }
        if (construction_stage_id) {
          checklistWhere.construction_stage_id = construction_stage_id;
        }

        const checklistMaxRaw = await db.ConstructionInspectionChecklist.max("sort_order", {
          where: checklistWhere,
          transaction,
        });

        const checklistMax = (checklistMaxRaw == null || isNaN(checklistMaxRaw)) ? 0 : Number(checklistMaxRaw);
        const parsedSortOrder = Number(sort_order);

        if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > checklistMax) {
          const e = new Error(`Invalid sort_order. Allowed range is 1 to ${checklistMax}.`);
          e.status = 400;
          throw e;
        }

        sort_order = parsedSortOrder;

        await db.ConstructionInspectionChecklist.increment("sort_order", {
          by: 1,
          where: {
            ...checklistWhere,
            sort_order: { [db.Sequelize.Op.gte]: sort_order },
            construction_inspection_checklist_id: { [db.Sequelize.Op.ne]: id },
          },
          transaction,
        });
      }
    }

    // ── 5. Check duplicate description ────────────────────────────────────────
    if (description !== undefined && updatedFieldName === "checklist") {
      const currentSectionId = section_id !== undefined ? section_id : existingData.section_id;
      if (currentSectionId) {
        const duplicate = await db.ConstructionInspectionChecklist.findOne({
          where: {
            section_id: currentSectionId,
            description: db.sequelize.where(
              db.sequelize.fn("LOWER", db.sequelize.col("description")),
              db.sequelize.fn("LOWER", description.trim()),
            ),
            construction_inspection_checklist_id: { [db.Sequelize.Op.ne]: id },
            ...orClause,
          },
          attributes: ["construction_inspection_checklist_id"],
          transaction,
        });
        if (duplicate) {
          const e = new Error("Checklist with this name already exists in this section"); e.status = 400; throw e;
        }
      }
    }

    // ── 6. Build update payload ───────────────────────────────────────────────
    const updatePayload = { updated_by: userId };
    if (builder !== undefined) {
      updatePayload.builder = builder;
    }
    if (construction_type_id !== undefined) {
      updatePayload.construction_type_id = construction_type_id;
    }
    if (construction_stage_id !== undefined) {
      updatePayload.construction_stage_id = construction_stage_id;
    }
    if (field_name !== undefined) {
      updatePayload.field_name = field_name;
    }
    if (description !== undefined) {
      updatePayload.description = description;
    }
    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }
    if (construction_option_id !== undefined) {
      updatePayload.construction_option_id = construction_option_id;
    }
    if (section_id !== undefined) {
      updatePayload.section_id = section_id;
    }
    if (add_all_existing_jobs !== undefined) {
      updatePayload.add_all_existing_jobs = add_all_existing_jobs;
    }

    if (Object.keys(updatePayload).length === 1) {
      const e = new Error("No fields provided to update"); e.status = 400; throw e;
    }

    await existing.update(updatePayload, { transaction });

    // ── 7. Fetch full response ────────────────────────────────────────────────
    const fullRecord = await db.ConstructionInspectionChecklist.findOne({
      where: { construction_inspection_checklist_id: id },
      attributes: [
        "construction_inspection_checklist_id", "field_name", "description",
        "sort_order", "add_all_existing_jobs", "construction_option_id",
        "created_at", "updated_at",
      ],
      include: [
        { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
        { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
        { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
        { model: db.ConstructionInspectionChecklist, as: "section", attributes: [["construction_inspection_checklist_id", "id"], "description"], required: false },
      ],
      transaction,
    });

    await transaction.commit();

    const plain = fullRecord.toJSON();

    return {
      construction_inspection_checklist_id: plain.construction_inspection_checklist_id,
      field_name: plain.field_name,
      description: plain.description,
      sort_order: plain.sort_order,
      add_all_existing_jobs: plain.add_all_existing_jobs,
      construction_option_id: plain.construction_option_id,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
      builder: plain.builderRef ?? null,
      construction_type: plain.constructionType ?? null,
      construction_stage: plain.constructionStage ?? null,
      section: plain.section ?? null,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getConstructionInspectionChecklistByIdService({ id, companyId, builderId }) {
  const orConditions = [];
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : {};

  // ── Fetch all checklists under this section_id ────────────────────────────
  const records = await db.ConstructionInspectionChecklist.findAll({
    where: {
      section_id: id,
      field_name: "checklist",
      ...orClause,
    },
    attributes: [
      "construction_inspection_checklist_id", "field_name", "description",
      "sort_order", "add_all_existing_jobs", "construction_option_id",
      "created_at", "updated_at",
    ],
    include: [
      { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
      { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
      { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
      { model: db.ConstructionInspectionChecklist, as: "section", attributes: [["construction_inspection_checklist_id", "id"], "description"], required: false },
    ],
    order: [["sort_order", "ASC"]],
  });

  return records.map((r) => {
    const plain = r.toJSON();
    return {
      construction_inspection_checklist_id: plain.construction_inspection_checklist_id,
      field_name: plain.field_name,
      description: plain.description,
      sort_order: plain.sort_order,
      add_all_existing_jobs: plain.add_all_existing_jobs,
      construction_option_id: plain.construction_option_id,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
      builder: plain.builderRef ?? null,
      construction_type: plain.constructionType ?? null,
      construction_stage: plain.constructionStage ?? null,
      section: plain.section ?? null,
    };
  });
}

export async function deleteConstructionInspectionChecklistService({
  id, companyId, builderId, add_all_existing_jobs,
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
    // ── 1. Check record exists ────────────────────────────────────────────────
    const existing = await db.ConstructionInspectionChecklist.findOne({
      where: { construction_inspection_checklist_id: id, ...orClause },
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction inspection checklist not found or access denied");
      error.status = 404;
      throw error;
    }

    const deletedData = existing.toJSON();
    let updatedData = deletedData;

    // ── 2. Update add_all_existing_jobs if provided, capture data, then delete
    if (add_all_existing_jobs !== undefined) {
      await existing.update({ add_all_existing_jobs }, { transaction });
      updatedData = existing.toJSON();
    }

    await existing.destroy({ transaction });

    // ── 3. Shift existing sort orders ─────────────────────────────────────────
    const shiftWhere = {
      field_name: deletedData.field_name,
      sort_order: { [db.Sequelize.Op.gt]: deletedData.sort_order },
      ...orClause,
    };

    if (deletedData.field_name === "section") {
      shiftWhere.builder = deletedData.builder;
      shiftWhere.construction_type_id = deletedData.construction_type_id;
      shiftWhere.construction_stage_id = deletedData.construction_stage_id;
    } else if (deletedData.field_name === "checklist") {
      shiftWhere.section_id = deletedData.section_id;
      if (deletedData.builder !== undefined) {
        shiftWhere.builder = deletedData.builder;
      }
      if (deletedData.construction_type_id !== undefined) {
        shiftWhere.construction_type_id = deletedData.construction_type_id;
      }
      if (deletedData.construction_stage_id !== undefined) {
        shiftWhere.construction_stage_id = deletedData.construction_stage_id;
      }
    }

    await db.ConstructionInspectionChecklist.decrement("sort_order", {
      by: 1,
      where: shiftWhere,
      transaction,
    });

    await transaction.commit();

    if (add_all_existing_jobs !== undefined) {
      return {
        data: updatedData,
        message: "Construction inspection checklist updated and deleted successfully",
      };
    }

    return { data: null, message: "Construction inspection checklist deleted successfully" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
