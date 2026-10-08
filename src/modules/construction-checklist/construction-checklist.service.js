import db from "../../config/database/models/postgre-models/index.js";

export async function createConstructionChecklistService({
  user_id,
  company_id,
  builder_id,
  name,
  construction_type_id,
  construction_stage_id,
  supplier_type_id,
  sort_order,
  data_required,
  supplier,
  claim,
  dependent,
  no_of_days,
  notify,
  milestone,
  attachment_mandatory,
  attachment_mandatory_name,
  cost_center_id,
  construction_option_id,
  compliance_type_id,
  builder,
}) {
  const transaction = await db.sequelize.transaction();

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : {};

  try {
    // ── 1. Check duplicate name ───────────────────────────────────────────────
    const duplicate = await db.ConstructionChecklist.findOne({
      where: { name: name.trim(), ...orClause },
      attributes: ["construction_checklist_id"],
      transaction,
    });

    if (duplicate) {
      const error = new Error("Checklist name already exists for this builder");
      error.status = 400;
      throw error;
    }

    // ── 2. Validate construction_type_id ──────────────────────────────────────
    if (construction_type_id) {
      const exists = await db.ConstructionType.findOne({
        where: { construction_type_id, builder_id },
        attributes: ["construction_type_id"],
        transaction,
      });
      if (!exists) {
        const error = new Error("Invalid construction_type_id");
        error.status = 400;
        throw error;
      }
    }

    // ── 3. Validate construction_stage_id ─────────────────────────────────────
    if (construction_stage_id) {
      const exists = await db.ConstructionStage.findOne({
        where: { construction_stage: construction_stage_id, builder_id },
        attributes: ["construction_stage"],
        transaction,
      });
      if (!exists) {
        const error = new Error("Invalid construction_stage_id");
        error.status = 400;
        throw error;
      }
    }

    // ── 4. Validate supplier_type_id ──────────────────────────────────────────
    if (supplier_type_id) {
      const exists = await db.SupplierType.findOne({
        where: { supplier_type_id, builder_id },
        attributes: ["supplier_type_id"],
        transaction,
      });
      if (!exists) {
        const error = new Error("Invalid supplier_type_id");
        error.status = 400;
        throw error;
      }
    }

    // ── 5. Validate cost_center_id array ──────────────────────────────────────
    if (Array.isArray(cost_center_id) && cost_center_id.length) {
      const valid = await db.CostCenter.findAll({
        where: {
          cost_center_id: { [db.Sequelize.Op.in]: cost_center_id },
          builder_id,
        },
        attributes: ["cost_center_id"],
        transaction,
      });
      if (valid.length !== cost_center_id.length) {
        const error = new Error("One or more cost_center_id are invalid");
        error.status = 400;
        throw error;
      }
    }

    // ── 6. Validate construction_option_id array ──────────────────────────────
    if (Array.isArray(construction_option_id) && construction_option_id.length) {
      const valid = await db.ConstructionOption.findAll({
        where: {
          construction_option_id: { [db.Sequelize.Op.in]: construction_option_id },
          builder_id,
        },
        attributes: ["construction_option_id"],
        transaction,
      });
      if (valid.length !== construction_option_id.length) {
        const error = new Error("One or more construction_option_id are invalid");
        error.status = 400;
        throw error;
      }
    }

    // ── 7. Validate compliance_type_id ────────────────────────────────────────
    if (compliance_type_id) {
      const exists = await db.ComplianceType.findOne({
        where: { compliance_type_id },
        attributes: ["compliance_type_id"],
        transaction,
      });
      if (!exists) {
        const error = new Error("Invalid compliance_type_id");
        error.status = 400;
        throw error;
      }
    }

    // ── 8. Validate builder if provided ───────────────────────────────────────
    if (builder) {
      const exists = await db.Builder.findOne({
        where: { builder_id: builder },
        attributes: ["builder_id"],
        transaction,
      });
      if (!exists) {
        const error = new Error("Invalid builder");
        error.status = 400;
        throw error;
      }
    }

    // ── 9. Resolve and validate sort_order ────────────────────────────────────
    const maxSortOrder = await db.ConstructionChecklist.max("sort_order", {
      where: { ...orClause },
      transaction,
    });

    const max = maxSortOrder ?? 0;

    if (sort_order == null) {
      sort_order = max + 1;
    }

    if (sort_order < 1 || sort_order > max + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
      error.status = 400;
      throw error;
    }

    // ── 10. Shift sort_order to make room ─────────────────────────────────────
    if (sort_order <= max) {
      await db.ConstructionChecklist.increment("sort_order", {
        by: 1,
        where: {
          sort_order: { [db.Sequelize.Op.gte]: sort_order },
          ...orClause,
        },
        transaction,
      });
    }

    // ── 11. Insert new checklist ──────────────────────────────────────────────
    const newChecklist = await db.ConstructionChecklist.create(
      {
        company_id,
        builder_id,
        builder: builder || null,
        construction_type_id: construction_type_id || null,
        construction_stage_id: construction_stage_id || null,
        name: name.trim(),
        supplier_type_id: supplier_type_id || null,
        sort_order,
        data_required: data_required ?? true,
        supplier: supplier ?? true,
        claim: claim ?? false,
        dependent: dependent ?? false,
        no_of_days,
        notify: notify ?? false,
        milestone: milestone ?? false,
        attachment_mandatory: attachment_mandatory ?? false,
        attachment_mandatory_name: attachment_mandatory_name || null,
        cost_center_id,
        construction_option_id,
        compliance_type_id: compliance_type_id || null,
        created_by: user_id,
        updated_by: user_id,
      },
      { transaction },
    );

    // ── 12. Fetch full response ───────────────────────────────────────────────
    const fullRecord = await db.ConstructionChecklist.findOne({
      where: { construction_checklist_id: newChecklist.construction_checklist_id },
      attributes: [
        "construction_checklist_id", "company_id", "builder_id", "builder",
        "name", "sort_order", "data_required", "supplier", "claim", "dependent",
        "no_of_days", "notify", "milestone", "attachment_mandatory",
        "attachment_mandatory_name", "cost_center_id", "construction_option_id",
        "created_by", "updated_by", "created_at", "updated_at",
      ],
      include: [
        { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
        { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
        { model: db.SupplierType, as: "supplierType", attributes: [["supplier_type_id", "id"], "name"], required: false },
        { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
        { model: db.ComplianceType, as: "complianceType", attributes: [["compliance_type_id", "id"], "name"], required: false },
        { model: db.Users, as: "createdByUser", attributes: [["name", "created_by_name"]], required: false },
      ],
      transaction,
    });

    // ── 13. Fetch array FK details ────────────────────────────────────────────
    const plain = fullRecord.toJSON();

    let costCenterDetails = [];
    if (plain.cost_center_id && plain.cost_center_id.length > 0) {
      const centers = await db.CostCenter.findAll({
        where: { cost_center_id: { [db.Sequelize.Op.in]: plain.cost_center_id } },
        attributes: [["cost_center_id", "id"], "name"],
        transaction,
      });
      costCenterDetails = centers.map((c) => c.toJSON());
    }

    let constructionOptionDetails = [];
    if (plain.construction_option_id && plain.construction_option_id.length > 0) {
      const options = await db.ConstructionOption.findAll({
        where: { construction_option_id: { [db.Sequelize.Op.in]: plain.construction_option_id } },
        attributes: [["construction_option_id", "id"], ["option_name", "name"]],
        transaction,
      });
      constructionOptionDetails = options.map((o) => o.toJSON());
    }

    await transaction.commit();

    return {
      construction_checklist_id: plain.construction_checklist_id,
      company_id: plain.company_id,
      builder_id: plain.builder_id,
      builder: {
        id: plain.builderRef?.id ?? null,
        name: plain.builderRef?.name ?? null,
      },
      name: plain.name,
      sort_order: plain.sort_order,
      data_required: plain.data_required,
      supplier: plain.supplier,
      claim: plain.claim,
      dependent: plain.dependent,
      no_of_days: plain.no_of_days,
      notify: plain.notify,
      milestone: plain.milestone,
      attachment_mandatory: plain.attachment_mandatory,
      attachment_mandatory_name: plain.attachment_mandatory_name,
      construction_type: {
        id: plain.constructionType?.id ?? null,
        name: plain.constructionType?.name ?? null,
      },
      construction_stage: {
        id: plain.constructionStage?.id ?? null,
        name: plain.constructionStage?.name ?? null,
      },
      supplier_type: {
        id: plain.supplierType?.id ?? null,
        name: plain.supplierType?.name ?? null,
      },
      cost_center: costCenterDetails,
      construction_option: constructionOptionDetails,
      compliance_type: {
        id: plain.complianceType?.id ?? null,
        name: plain.complianceType?.name ?? null,
      },
      created_by_name: plain.createdByUser?.created_by_name ?? null,
      created_by: plain.created_by,
      updated_by: plain.updated_by,
      created_at: null,
      updated_at: null,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllConstructionChecklistsService({
  company_id,
  builder_id,
  construction_type_id,
  construction_stage_id,
  builder,
  name,
}) {
  // ── 1. Build where clause ─────────────────────────────────────────────────
  const whereClause = {
    [db.Sequelize.Op.or]: [
      { company_id },
      { builder_id },
    ],
  };

  if (construction_type_id) {
    whereClause.construction_type_id = construction_type_id;
  }
  if (construction_stage_id) {
    whereClause.construction_stage_id = construction_stage_id;
  }
  if (builder) {
    whereClause.builder = builder;
  }
  if (name) {
    whereClause.name = { [db.Sequelize.Op.iLike]: `%${name}%` };
  }

  // ── 2. Fetch all checklists with associations ─────────────────────────────
  const checklists = await db.ConstructionChecklist.findAll({
    where: whereClause,
    attributes: [
      "construction_checklist_id", "company_id", "builder_id", "builder",
      "name", "sort_order", "data_required", "supplier", "claim", "dependent",
      "no_of_days", "notify", "milestone", "attachment_mandatory",
      "attachment_mandatory_name", "po_folder_id", "job_documents_folder_id",
      "cost_center_id", "construction_option_id",
      "created_by", "updated_by", "created_at", "updated_at",
    ],
    include: [
      { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
      { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
      { model: db.SupplierType, as: "supplierType", attributes: [["supplier_type_id", "id"], "name"], required: false },
      { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
      { model: db.ComplianceType, as: "complianceType", attributes: [["compliance_type_id", "id"], "name"], required: false },
      {
        model: db.ConstructionChecklistPredecessor,
        as: "predecessors",
        attributes: [
          ["construction_checklist_predecessor_id", "constructionChecklistPredecessorId"],
          ["construction_checklist_id", "constructionChecklistId"],
          ["predecessor_checklist_id", "predecessorChecklistId"],
          "off_set",
          "duration",
        ],
        required: false,
        where: {
          predecessor_checklist_id: { [db.Sequelize.Op.ne]: null },
        },
        include: [
          {
            model: db.ConstructionChecklist,
            as: "predecessorChecklist",
            attributes: [["name", "predecessorChecklistName"]],
            required: false,
          },
        ],
      },
    ],
    order: [
      ["sort_order", "ASC"],
      ["created_at", "DESC"],
    ],
  });

  // ── 3. Attach array FK details and shape response ─────────────────────────
  const result = await Promise.all(
    checklists.map(async (cc) => {
      const plain = cc.toJSON();

      let costCenterDetails = [];
      if (plain.cost_center_id && plain.cost_center_id.length > 0) {
        const centers = await db.CostCenter.findAll({
          where: { cost_center_id: { [db.Sequelize.Op.in]: plain.cost_center_id } },
          attributes: [["cost_center_id", "id"], "name"],
        });
        costCenterDetails = centers.map((c) => c.toJSON());
      }

      let constructionOptionDetails = [];
      if (plain.construction_option_id && plain.construction_option_id.length > 0) {
        const options = await db.ConstructionOption.findAll({
          where: { construction_option_id: { [db.Sequelize.Op.in]: plain.construction_option_id } },
          attributes: [["construction_option_id", "id"], ["option_name", "name"]],
        });
        constructionOptionDetails = options.map((o) => o.toJSON());
      }

      // ── Shape predecessors to match original response ──────────────────────
      const predecessors = (plain.predecessors || []).map((p) => ({
        constructionChecklistPredecessorId: p.constructionChecklistPredecessorId,
        constructionChecklistId: p.constructionChecklistId,
        predecessorChecklistId: p.predecessorChecklistId,
        predecessorChecklistName: p.predecessorChecklist?.predecessorChecklistName ?? null,
        offset: p.off_set,
        duration: p.duration,
      }));

      return {
        construction_checklist_id: plain.construction_checklist_id,
        company_id: plain.company_id,
        builder_id: plain.builder_id,
        builder: {
          id: plain.builderRef?.id ?? null,
          name: plain.builderRef?.name ?? null,
        },
        name: plain.name,
        sort_order: plain.sort_order,
        data_required: plain.data_required,
        supplier: plain.supplier,
        claim: plain.claim,
        dependent: plain.dependent,
        no_of_days: plain.no_of_days,
        notify: plain.notify,
        milestone: plain.milestone,
        attachment_mandatory: plain.attachment_mandatory,
        attachment_mandatory_name: plain.attachment_mandatory_name,
        po_folder_id: plain.po_folder_id,
        job_documents_folder_id: plain.job_documents_folder_id,
        construction_type: {
          id: plain.constructionType?.id ?? null,
          name: plain.constructionType?.name ?? null,
        },
        construction_stage: {
          id: plain.constructionStage?.id ?? null,
          name: plain.constructionStage?.name ?? null,
        },
        supplier_type: {
          id: plain.supplierType?.id ?? null,
          name: plain.supplierType?.name ?? null,
        },
        cost_center: costCenterDetails,
        construction_option: constructionOptionDetails,
        compliance_type: {
          id: plain.complianceType?.id ?? null,
          name: plain.complianceType?.name ?? null,
        },
        predecessor: predecessors,
      };
    }),
  );

  return result;
}

export async function getConstructionChecklistByIdService({ construction_checklist_id }) {
  // ── 1. Fetch checklist with all associations ──────────────────────────────
  const checklist = await db.ConstructionChecklist.findOne({
    where: { construction_checklist_id },
    include: [
      { model: db.ConstructionType, as: "constructionType", attributes: [["types_name", "construction_type_name"]], required: false },
      { model: db.ConstructionStage, as: "constructionStage", attributes: [["stage_name", "construction_stage_name"]], required: false },
      { model: db.SupplierType, as: "supplierType", attributes: [["name", "supplier_type_name"]], required: false },
      { model: db.Builder, as: "builderRef", attributes: [["name", "builder_name"]], required: false },
      { model: db.ComplianceType, as: "complianceType", attributes: [["name", "compliance_type_name"]], required: false },
      { model: db.Users, as: "createdByUser", attributes: [["name", "created_by_name"]], required: false },
    ],
  });

  if (!checklist) {
    const error = new Error("Construction checklist not found.");
    error.status = 404;
    throw error;
  }

  const plain = checklist.toJSON();

  // ── 2. Fetch cost_center details (array FK) ───────────────────────────────
  let costCenterDetails = [];
  let costCenterName = null;
  if (plain.cost_center_id && plain.cost_center_id.length > 0) {
    const centers = await db.CostCenter.findAll({
      where: { cost_center_id: { [db.Sequelize.Op.in]: plain.cost_center_id } },
      attributes: ["cost_center_id", "name"],
    });
    costCenterDetails = centers.map((c) => ({ id: c.cost_center_id, name: c.name }));
    costCenterName = centers.map((c) => c.name).join(", ");
  }

  // ── 3. Fetch construction_option details (array FK) ───────────────────────
  let constructionOptionDetails = [];
  let constructionOptionName = null;
  if (plain.construction_option_id && plain.construction_option_id.length > 0) {
    const options = await db.ConstructionOption.findAll({
      where: { construction_option_id: { [db.Sequelize.Op.in]: plain.construction_option_id } },
      attributes: ["construction_option_id", "option_name"],
    });
    constructionOptionDetails = options.map((o) => ({ id: o.construction_option_id, name: o.option_name }));
    constructionOptionName = options.map((o) => o.option_name).join(", ");
  }

  return {
    ...plain,
    construction_type_name: plain.constructionType?.construction_type_name ?? null,
    construction_stage_name: plain.constructionStage?.construction_stage_name ?? null,
    supplier_type_name: plain.supplierType?.supplier_type_name ?? null,
    builder_name: plain.builderRef?.builder_name ?? null,
    compliance_type_name: plain.complianceType?.compliance_type_name ?? null,
    created_by_name: plain.createdByUser?.created_by_name ?? null,
    cost_center_name: costCenterName,
    construction_option_name: constructionOptionName,
    cost_center: costCenterDetails,
    construction_option: constructionOptionDetails,
    // ── clean up nested association keys ──────────────────────────────────
    constructionType: undefined,
    constructionStage: undefined,
    supplierType: undefined,
    builderRef: undefined,
    complianceType: undefined,
    createdByUser: undefined,
  };
}

export async function updateConstructionChecklistService({
  construction_checklist_id,
  user_id,
  company_id,
  builder_id,
  name,
  construction_type_id,
  construction_stage_id,
  supplier_type_id,
  sort_order,
  data_required,
  supplier,
  claim,
  dependent,
  no_of_days,
  notify,
  milestone,
  attachment_mandatory,
  attachment_mandatory_name,
  cost_center_id,
  construction_option_id,
  compliance_type_id,
  builder,
  po_folder_id,
  job_documents_folder_id,
}) {
  const transaction = await db.sequelize.transaction();

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : {};

  try {
    // ── 1. Check record exists ────────────────────────────────────────────────
    const existing = await db.ConstructionChecklist.findOne({
      where: { construction_checklist_id, ...orClause },
      transaction,
    });

    if (!existing) {
      const error = new Error("Construction checklist not found.");
      error.status = 404;
      throw error;
    }

    const currentData = existing.toJSON();

    // ── 2. Validate foreign keys ──────────────────────────────────────────────
    if (construction_type_id) {
      const exists = await db.ConstructionType.findOne({ where: { construction_type_id }, attributes: ["construction_type_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid construction_type_id"); e.status = 400; throw e;
      }
    }

    if (construction_stage_id) {
      const exists = await db.ConstructionStage.findOne({ where: { construction_stage: construction_stage_id }, attributes: ["construction_stage"], transaction });
      if (!exists) {
        const e = new Error("Invalid construction_stage_id"); e.status = 400; throw e;
      }
    }

    if (supplier_type_id) {
      const exists = await db.SupplierType.findOne({ where: { supplier_type_id }, attributes: ["supplier_type_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid supplier_type_id"); e.status = 400; throw e;
      }
    }

    if (Array.isArray(cost_center_id) && cost_center_id.length) {
      const valid = await db.CostCenter.findAll({ where: { cost_center_id: { [db.Sequelize.Op.in]: cost_center_id } }, attributes: ["cost_center_id"], transaction });
      if (valid.length !== cost_center_id.length) {
        const e = new Error("One or more cost_center_id are invalid"); e.status = 400; throw e;
      }
    }

    if (Array.isArray(construction_option_id) && construction_option_id.length) {
      const valid = await db.ConstructionOption.findAll({ where: { construction_option_id: { [db.Sequelize.Op.in]: construction_option_id } }, attributes: ["construction_option_id"], transaction });
      if (valid.length !== construction_option_id.length) {
        const e = new Error("One or more construction_option_id are invalid"); e.status = 400; throw e;
      }
    }

    if (compliance_type_id) {
      const exists = await db.ComplianceType.findOne({ where: { compliance_type_id }, attributes: ["compliance_type_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid compliance_type_id"); e.status = 400; throw e;
      }
    }

    if (builder) {
      const exists = await db.Builder.findOne({ where: { builder_id: builder }, attributes: ["builder_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid builder"); e.status = 400; throw e;
      }
    }

    if (po_folder_id) {
      const exists = await db.DocumentCommonFolder.findOne({ where: { document_common_folder_id: po_folder_id }, attributes: ["document_common_folder_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid po_folder_id"); e.status = 400; throw e;
      }
    }

    if (job_documents_folder_id) {
      const exists = await db.DocumentCommonFolder.findOne({ where: { document_common_folder_id: job_documents_folder_id }, attributes: ["document_common_folder_id"], transaction });
      if (!exists) {
        const e = new Error("Invalid job_documents_folder_id"); e.status = 400; throw e;
      }
    }

    // ── 3. Business logic: data_required / attachment_mandatory ───────────────
    const newDataRequired = data_required !== undefined ? data_required : currentData.data_required;
    const newAttachmentMandatory = attachment_mandatory !== undefined ? attachment_mandatory : currentData.attachment_mandatory;

    if (newDataRequired === false && no_of_days !== undefined && no_of_days) {
      const e = new Error("no_of_days cannot be set when data_required is false"); e.status = 400; throw e;
    }

    if (newAttachmentMandatory === false && attachment_mandatory_name !== undefined && attachment_mandatory_name) {
      const e = new Error("attachment_mandatory_name cannot be set when attachment_mandatory is false"); e.status = 400; throw e;
    }

    // ── 4. Check duplicate name ───────────────────────────────────────────────
    if (name !== undefined) {
      const duplicate = await db.ConstructionChecklist.findOne({
        where: {
          name: name.trim(),
          construction_checklist_id: { [db.Sequelize.Op.ne]: construction_checklist_id },
          ...orClause,
        },
        attributes: ["construction_checklist_id"],
        transaction,
      });
      if (duplicate) {
        const e = new Error("Checklist name already exists for this builder"); e.status = 400; throw e;
      }
    }
    // ── 5. Resolve and validate sort_order ────────────────────────────────────
    if (sort_order !== undefined) {
      const maxSortOrder = await db.ConstructionChecklist.max("sort_order", {
        where: { ...orClause },
        transaction,
      });

      const max = maxSortOrder ?? 0;

      if (sort_order < 1 || sort_order > max) {
        const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max}.`);
        error.status = 400;
        throw error;
      }

      // ── Reorder: shift other records to make room ───────────────────────────
      const oldSortOrder = currentData.sort_order;

      if (sort_order !== oldSortOrder) {
        if (sort_order > oldSortOrder) {
          // Moving down — shift records between old and new position up
          await db.ConstructionChecklist.increment("sort_order", {
            by: -1,
            where: {
              sort_order: {
                [db.Sequelize.Op.gt]: oldSortOrder,
                [db.Sequelize.Op.lte]: sort_order,
              },
              construction_checklist_id: { [db.Sequelize.Op.ne]: construction_checklist_id },
              ...orClause,
            },
            transaction,
          });
        } else {
          // Moving up — shift records between new and old position down
          await db.ConstructionChecklist.increment("sort_order", {
            by: 1,
            where: {
              sort_order: {
                [db.Sequelize.Op.gte]: sort_order,
                [db.Sequelize.Op.lt]: oldSortOrder,
              },
              construction_checklist_id: { [db.Sequelize.Op.ne]: construction_checklist_id },
              ...orClause,
            },
            transaction,
          });
        }
      }
    }

    // ── 6. Build update payload ───────────────────────────────────────────────
    const updatePayload = { updated_by: user_id };

    if (data_required === false && currentData.data_required === true) {
      updatePayload.no_of_days = null;
    }
    if (attachment_mandatory === false && currentData.attachment_mandatory === true) {
      updatePayload.attachment_mandatory_name = null;
    }

    if (name !== undefined) {
      updatePayload.name = name.trim();
    }
    if (construction_type_id !== undefined) {
      updatePayload.construction_type_id = construction_type_id || null;
    }
    if (construction_stage_id !== undefined) {
      updatePayload.construction_stage_id = construction_stage_id || null;
    }
    if (supplier_type_id !== undefined) {
      updatePayload.supplier_type_id = supplier_type_id || null;
    }
    if (sort_order !== undefined) {
      updatePayload.sort_order = sort_order;
    }
    if (data_required !== undefined) {
      updatePayload.data_required = data_required;
    }
    if (supplier !== undefined) {
      updatePayload.supplier = supplier;
    }
    if (claim !== undefined) {
      updatePayload.claim = claim;
    }
    if (dependent !== undefined) {
      updatePayload.dependent = dependent;
    }
    if (no_of_days !== undefined) {
      updatePayload.no_of_days = no_of_days || 1;
    }
    if (notify !== undefined) {
      updatePayload.notify = notify;
    }
    if (milestone !== undefined) {
      updatePayload.milestone = milestone;
    }
    if (attachment_mandatory !== undefined) {
      updatePayload.attachment_mandatory = attachment_mandatory;
    }
    if (attachment_mandatory_name !== undefined) {
      updatePayload.attachment_mandatory_name = attachment_mandatory_name || null;
    }
    if (cost_center_id !== undefined) {
      updatePayload.cost_center_id = cost_center_id || [];
    }
    if (construction_option_id !== undefined) {
      updatePayload.construction_option_id = construction_option_id || [];
    }
    if (compliance_type_id !== undefined) {
      updatePayload.compliance_type_id = compliance_type_id || null;
    }
    if (builder !== undefined) {
      updatePayload.builder = builder || null;
    }
    if (po_folder_id !== undefined) {
      updatePayload.po_folder_id = po_folder_id || null;
    }
    if (job_documents_folder_id !== undefined) {
      updatePayload.job_documents_folder_id = job_documents_folder_id || null;
    }

    if (Object.keys(updatePayload).length === 1) {
      const e = new Error("At least one field is required for update."); e.status = 400; throw e;
    }

    await existing.update(updatePayload, { transaction });

    // ── 7. Fetch full response ────────────────────────────────────────────────
    const fullRecord = await db.ConstructionChecklist.findOne({
      where: { construction_checklist_id },
      attributes: [
        "construction_checklist_id", "company_id", "builder_id", "builder",
        "name", "sort_order", "data_required", "supplier", "claim", "dependent",
        "no_of_days", "notify", "milestone", "attachment_mandatory",
        "attachment_mandatory_name", "cost_center_id", "construction_option_id",
        "created_by", "updated_by", "created_at", "updated_at",
      ],
      include: [
        { model: db.ConstructionType, as: "constructionType", attributes: [["construction_type_id", "id"], ["types_name", "name"]], required: false },
        { model: db.ConstructionStage, as: "constructionStage", attributes: [["construction_stage", "id"], ["stage_name", "name"]], required: false },
        { model: db.SupplierType, as: "supplierType", attributes: [["supplier_type_id", "id"], "name"], required: false },
        { model: db.Builder, as: "builderRef", attributes: [["builder_id", "id"], "name"], required: false },
        { model: db.ComplianceType, as: "complianceType", attributes: [["compliance_type_id", "id"], "name"], required: false },
        { model: db.DocumentCommonFolder, as: "poFolder", attributes: [["document_common_folder_id", "id"], "name"], required: false },
        { model: db.DocumentCommonFolder, as: "jobDocumentFolder", attributes: [["document_common_folder_id", "id"], "name"], required: false },
        { model: db.Users, as: "createdByUser", attributes: [["name", "created_by_name"]], required: false },
      ],
      transaction,
    });

    const plain = fullRecord.toJSON();

    // ── 8. Fetch array FK details ─────────────────────────────────────────────
    let costCenterDetails = [];
    if (plain.cost_center_id && plain.cost_center_id.length > 0) {
      const centers = await db.CostCenter.findAll({
        where: { cost_center_id: { [db.Sequelize.Op.in]: plain.cost_center_id } },
        attributes: [["cost_center_id", "id"], "name"],
        transaction,
      });
      costCenterDetails = centers.map((c) => c.toJSON());
    }

    let constructionOptionDetails = [];
    if (plain.construction_option_id && plain.construction_option_id.length > 0) {
      const options = await db.ConstructionOption.findAll({
        where: { construction_option_id: { [db.Sequelize.Op.in]: plain.construction_option_id } },
        attributes: [["construction_option_id", "id"], ["option_name", "name"]],
        transaction,
      });
      constructionOptionDetails = options.map((o) => o.toJSON());
    }

    await transaction.commit();

    return {
      construction_checklist_id: plain.construction_checklist_id,
      company_id: plain.company_id,
      builder_id: plain.builder_id,
      name: plain.name,
      sort_order: plain.sort_order,
      data_required: plain.data_required,
      supplier: plain.supplier,
      claim: plain.claim,
      dependent: plain.dependent,
      no_of_days: plain.no_of_days,
      notify: plain.notify,
      milestone: plain.milestone,
      attachment_mandatory: plain.attachment_mandatory,
      attachment_mandatory_name: plain.attachment_mandatory_name,
      created_by: plain.created_by,
      updated_by: plain.updated_by,
      created_at: plain.created_at,
      updated_at: plain.updated_at,
      created_by_name: plain.createdByUser?.created_by_name ?? null,
      construction_type: plain.constructionType ?? null,
      construction_stage: plain.constructionStage ?? null,
      supplier_type: plain.supplierType ?? null,
      builder: plain.builderRef ?? null,
      compliance_type: plain.complianceType ?? null,
      po_folder: plain.poFolder ?? null,
      job_document_folder: plain.jobDocumentFolder ?? null,
      cost_center: costCenterDetails,
      construction_option: constructionOptionDetails,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteConstructionChecklistService({
  constructionChecklistId,
  companyId,
  builderId,
}) {
  // ── Check checklist exists and is owned ─────────────────────────────────────
  const existing = await db.ConstructionChecklist.findOne({
    where: {
      construction_checklist_id: constructionChecklistId,
      [db.Sequelize.Op.or]: [
        { company_id: companyId },
        { builder_id: builderId },
      ],
    },
    attributes: ["construction_checklist_id", "sort_order"],
  });

  if (!existing) {
    const error = new Error("Construction checklist not found.");
    error.status = 404;
    throw error;
  }

  const deletedSortOrder = existing.sort_order;

  // ── Transaction: delete + shift sort_orders ─────────────────────────────────
  const t = await db.sequelize.transaction();
  try {
    await db.ConstructionChecklist.destroy({
      where: { construction_checklist_id: constructionChecklistId },
      transaction: t,
    });

    await db.ConstructionChecklist.decrement("sort_order", {
      by: 1,
      where: {
        company_id: companyId,
        builder_id: builderId,
        sort_order: { [db.Sequelize.Op.gt]: deletedSortOrder },
      },
      transaction: t,
    });

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}
