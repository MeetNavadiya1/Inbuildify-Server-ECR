import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Sequelize } from "sequelize";
import { logActivity } from "../../utils/activityLogger.js";

const { Op } = Sequelize;

const allowedUpdateFields = [
  "street_name",
  "land_developer",
  "council",
  "title_volume",
  "folio",
  "plan_subdivision",
  "site_fall",
  "existing_tree",
  "driveaway_location",
  "any_sewer_tie",
  "easements",
  "buildup_area_easements",
  "build_zone",
  "story_id",
  "finished_surface_m",
  "existing_surface_m",
  "filled_area_fill_m",
  "max_fill_location",
  "max_finished_surface_m",
  "min_finished_surface_m",
  "engineering_fall_m",
  "fall_type",
  "ceiling_height",
  "eaves_location",
  "lot_type",
  "site_coverage_allowed",
  "eaves_size",
  "eaves_return",
  "roof_covering",
  "roof_pitch",
  "flat_roof_pitch",
  "parapet_wall",
  "single_story",
  "double_story_gf",
  "double_story_ff",
  "wall_over_garage",
  "wall_over_lower_roof",
  "all_electric",
  "type_of_cooling",
  "garage_door_type",
  "connection",
  "recycled_water",
  "extra_requirement",
  "three_phase",
  "driveway",
  "front_wall",
  "between_garage_building",
  "garage_side",
  "other_side",
  "rear",
  "allowed_porch_encroachment",
  "boundry_build",
  "boundry_construction",
  "double_story_front_wall",
  "double_story_garage_side",
  "double_story_other_side",
  "double_story_rear",
  "double_story_balcony_encroachment",
  "facade_material_requirement",
  "raised_porch_facade",
  "parapet_walls_pitch_roof",
  "parapet_walls_tray_deck_roof",
  "concept_inspiration",
  "plan_subdivision_engineering",
  "memorandum_common_provisions",
  "developer_guidelines",
  "contact_for_sale",
  "variational_list",
  "special_job_notes",
];

const strictNullableFields = [
  "existing_tree",
  "any_sewer_tie",
  "easements",
  "buildup_area_easements",
  "boundry_build",
  "boundry_construction",
  "all_electric",
  "recycled_water",
  "raised_porch_facade",
  "parapet_walls_pitch_roof",
  "parapet_walls_tray_deck_roof",
  "concept_inspiration",
  "plan_subdivision_engineering",
  "memorandum_common_provisions",
  "developer_guidelines",
  "contact_for_sale",
  "variational_list",
];

export async function createJobFormService(data, userContext) {
  const { JobForm, Leads, DwellingType } = db;
  const { builderId, companyId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    // Validate story_id if present
    if (data.story_id) {
      const dwellingType = await DwellingType.findOne({
        where: { dwelling_type_id: data.story_id },
        transaction,
      });

      if (!dwellingType) {
        throw { status: 400, message: "Invalid dwelling type ID" };
      }
      if (!dwellingType.is_active) {
        throw { status: 400, message: "Dwelling type is inactive" };
      }
    }

    // Validate leads ownership
    const orConditions = [];
    if (companyId) orConditions.push({ company_id: companyId });
    if (builderId) orConditions.push({ builder_id: builderId });

    const lead = await Leads.findOne({
      where: {
        leads_id: data.leads_id,
        [Op.or]: orConditions,
      },
      transaction,
    });

    if (!lead) {
      throw { status: 404, message: "Lead not found or does not belong to your organization" };
    }

    // Uniqueness validation
    const existingJobForm = await JobForm.findOne({
      where: { leads_id: data.leads_id },
      transaction,
    });

    if (existingJobForm) {
      throw { status: 400, message: "Job form already exists for this lead. Only one job form is allowed per lead." };
    }

    // Build payload maintaining parity with legacy logic
    const createPayload = {};
    for (const field of allowedUpdateFields) {
      if (data[field] !== undefined) {
        if (field === "facade_material_requirement") {
          createPayload[field] = data[field] ? JSON.stringify(data[field]) : null;
        } else if (strictNullableFields.includes(field)) {
          createPayload[field] = data[field] === null ? null : data[field];
        } else {
          createPayload[field] = data[field] || null;
        }
      }
    }

    createPayload.leads_id = data.leads_id || null;

    const newJobForm = await JobForm.create(createPayload, { transaction });

    await logActivity(transaction, {
      userId: userContext?.users_id,
      builderId,
      companyId,
      referenceId: data.leads_id,
      referenceType: "LEAD",
      module: "JobForm",
      moduleId: newJobForm.job_form_id,
      recordName: "Job Details",
      action: "CREATE",
      fieldName: null,
      oldValue: null,
      newValue: null,
      description: "Job details created"
    });

    // Since the raw SQL returns the parsed/raw object, return it plain.
    return newJobForm.get({ plain: true });
  });
}

export async function getAllJobFormsService(queryParams, userContext) {
  const { JobForm, Leads } = db;
  const { builderId, companyId } = userContext;
  const { page = 1, limit = 25, search } = queryParams;

  const offset = (page - 1) * limit;

  const leadOrConditions = [];
  if (companyId) leadOrConditions.push({ company_id: companyId });
  if (builderId) leadOrConditions.push({ builder_id: builderId });

  const whereConditions = {};
  
  if (search) {
    const searchRegex = `%${search.toLowerCase()}%`;
    whereConditions[Op.or] = [
      { street_name: { [Op.iLike]: searchRegex } },
      { '$lead.name$': { [Op.iLike]: searchRegex } },
      { '$lead.email$': { [Op.iLike]: searchRegex } },
      { '$lead.phone$': { [Op.iLike]: searchRegex } }
    ];
  }

  const { rows, count } = await JobForm.findAndCountAll({
    where: whereConditions,
    include: [
      {
        model: Leads,
        as: "lead",
        attributes: ["leads_id", "name", "email", "phone"],
        where: {
          [Op.or]: leadOrConditions,
        },
        required: true, 
      },
    ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const jobForms = rows.map((row) => {
    const plain = row.get({ plain: true });
    const lead = plain.lead || {};
    
    // Flatten result to match raw SQL
    const mappedJobForm = {
      ...plain,
      leads_id: lead.leads_id,
      name: lead.name || null,
      email: lead.email || null,
      phone: lead.phone || null,
    };
    
    delete mappedJobForm.lead;
    return mappedJobForm;
  });

  return {
    jobForms,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalItems: count,
      itemsPerPage: parseInt(limit),
    },
  };
}

export async function getJobFormById(reqUser, leads_id) {
  const { JobForm, Leads } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const orConditions = [];
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }

  const jobForm = await JobForm.findOne({
    where: { leads_id },
    include: [
      {
        model: Leads,
        as: "lead",
        attributes: ["leads_id", "name", "email", "phone"],
        where: {
          [Op.or]: orConditions,
        },
        required: true,
      },
    ],
  });

  if (!jobForm) {
    return null;
  }

  const plain = jobForm.get({ plain: true });
  const lead = plain.lead || {};

  const result = {
    ...keysToCamelCase(plain),
    leadsId: lead.leads_id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
  };

  delete result.lead;

  return result;
}

export async function updateJobFormService(jobFormId, data, userContext) {
  const { JobForm, Leads, DwellingType } = db;
  const { builderId, companyId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    const orConditions = [];
    if (companyId) orConditions.push({ company_id: companyId });
    if (builderId) orConditions.push({ builder_id: builderId });

    // Validate ownership
    const jobForm = await JobForm.findOne({
      where: { job_form_id: jobFormId },
      include: [
        {
          model: Leads,
          as: "lead",
          where: { [Op.or]: orConditions },
          required: true,
        },
      ],
      transaction,
    });

    if (!jobForm) {
      throw { status: 404, message: "Job form not found or does not belong to your organization" };
    }

    // Validate story_id if present
    if (data.story_id) {
      const dwellingType = await DwellingType.findOne({
        where: { dwelling_type_id: data.story_id },
        transaction,
      });

      if (!dwellingType) {
        throw { status: 400, message: "Invalid dwelling type ID" };
      }
      if (!dwellingType.is_active) {
        throw { status: 400, message: "Dwelling type is inactive" };
      }
    }

    const payload = {};
    for (const field of allowedUpdateFields) {
      if (data[field] !== undefined) {
        if (field === "facade_material_requirement") {
          // Sequelize handles JSONB mapping correctly when passed object or null
          payload[field] = data[field] ? JSON.stringify(data[field]) : null;
        } else if (strictNullableFields.includes(field)) {
          payload[field] = data[field] === null ? null : data[field];
        } else {
          payload[field] = data[field] || null;
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      throw { status: 400, message: "No valid fields to update" };
    }

    payload.updated_at = new Date();

    await jobForm.update(payload, { transaction });

    await logActivity(transaction, {
      userId: userContext?.users_id,
      builderId,
      companyId,
      referenceId: jobForm.leads_id,
      referenceType: "LEAD",
      module: "JobForm",
      moduleId: jobForm.job_form_id,
      recordName: "Job Details",
      action: "UPDATE",
      fieldName: null,
      oldValue: null,
      newValue: null,
      description: "Job details updated"
    });

    return jobForm.get({ plain: true });
  });
}

export async function deleteJobFormService(jobFormId, userContext) {
  const { JobForm, Leads } = db;
  const { builderId, companyId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    const orConditions = [];
    if (companyId) orConditions.push({ company_id: companyId });
    if (builderId) orConditions.push({ builder_id: builderId });

    const jobForm = await JobForm.findOne({
      where: { job_form_id: jobFormId },
      include: [
        {
          model: Leads,
          as: "lead",
          where: { [Op.or]: orConditions },
          required: true,
        },
      ],
      transaction,
    });

    if (!jobForm) {
      throw { status: 404, message: "Job form not found or does not belong to your organization" };
    }

    await jobForm.destroy({ transaction });

    return null;
  });
}

export default {
  createJobFormService,
  getAllJobFormsService,
  getJobFormById,
  updateJobFormService,
  deleteJobFormService,
};
