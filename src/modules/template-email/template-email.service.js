import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";

export async function createTemplateEmailService({ builderId, companyId, userId, payload }) {
  const {
    name,
    type,
    subject,
    email_content,
    additional_recipient_users = [],
    additional_recipient_groups = [],
    is_active = true,
  } = payload;

  // ── 1. Validate builder ─────────────────────────────────────────────────────
  const validBuilder = await db.Builder.findOne({
    where: { builder_id: builderId },
    attributes: ["builder_id"],
  });

  if (!validBuilder) {
    const error = new Error("Invalid builder.");
    error.status = 400;
    throw error;
  }

  // ── 2. Validate user ────────────────────────────────────────────────────────
  const validUser = await db.Users.findOne({
    where: { users_id: userId, is_deleted: false },
    attributes: ["users_id"],
  });

  if (!validUser) {
    const error = new Error("Invalid user.");
    error.status = 400;
    throw error;
  }

  // ── 3. Validate additional_recipient_users ──────────────────────────────────
  if (additional_recipient_users.length > 0) {
    const validUsers = await db.Users.findAll({
      where: {
        users_id: { [Op.in]: additional_recipient_users },
        is_deleted: false,
      },
      attributes: ["users_id"],
    });

    if (validUsers.length !== additional_recipient_users.length) {
      const error = new Error("One or more recipient users are invalid or do not belong to this builder.");
      error.status = 400;
      throw error;
    }
  }

  // ── 4. Validate additional_recipient_groups (exists + active) ───────────────
  if (additional_recipient_groups.length > 0) {
    const validGroups = await db.UserGroup.findAll({
      where: {
        user_group_id: { [Op.in]: additional_recipient_groups },
        builder_id: builderId,
      },
      attributes: ["user_group_id"],
    });

    if (validGroups.length !== additional_recipient_groups.length) {
      const error = new Error("One or more recipient groups are invalid or do not belong to this builder.");
      error.status = 400;
      throw error;
    }

    const activeGroups = await db.UserGroup.findAll({
      where: {
        user_group_id: { [Op.in]: additional_recipient_groups },
        builder_id: builderId,
        is_active: true,
      },
      attributes: ["user_group_id"],
    });

    if (activeGroups.length !== additional_recipient_groups.length) {
      const error = new Error("One or more recipient groups are inactive.");
      error.status = 400;
      throw error;
    }
  }

  // ── 5. Duplicate name check ─────────────────────────────────────────────────
  const duplicate = await db.TemplateEmail.findOne({
    where: {
      name: db.sequelize.where(
        db.sequelize.fn("LOWER", db.sequelize.col("name")),
        name.toLowerCase(),
      ),
      company_id: companyId,
      builder_id: builderId,
    },
    attributes: ["template_email_id"],
  });

  if (duplicate) {
    const error = new Error("Template email with this name already exists.");
    error.status = 409;
    throw error;
  }

  // ── 6. Insert (single write — no transaction needed) ────────────────────────
  const newTemplate = await db.TemplateEmail.create({
    company_id: companyId,
    builder_id: builderId,
    name,
    type: type || "standard",
    subject: subject || null,
    email_content,
    additional_recipient_users,
    additional_recipient_groups,
    is_active,
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(newTemplate.toJSON());
}

/* ---------------------------------
   GET TEMPLATES
---------------------------------- */
export async function getTemplateEmailsService(user, queryParams) {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;
  const userId = user?.users_id;

  if (!builderId && !companyId) {
    const error = new Error("Unauthorized access.");
    error.status = 401;
    throw error;
  }

  const { name, type } = queryParams;

  const orConditions = [];
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }
  const orClause = orConditions.length > 0 ? { [Op.or]: orConditions } : { template_email_id: null };

  const existingCount = await db.TemplateEmail.count({ where: orClause });

  if (existingCount === 0) {
    const staticTemplates = [
      { name: "1st Follow-up", type: "customized", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "2nd Follow-up", type: "customized", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Acknowledgment mail to customer", type: "standard", subject: "[Logged User Name][jobAddress][First Name]", email_content: "<b>Maintenance task completed. Thank you for choosing us.</b>", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Agent Summary report", type: "standard", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Appointment booked with Customer", type: "standard", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Appointment Booked with ReferralPartner", type: "standard", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Appointment Cancellation", type: "customized", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Appointment with client", type: "customized", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Book Color Appointment", type: "customized", subject: null, email_content: "", additional_recipient_users: [], additional_recipient_groups: [] },
      { name: "Book Supplier", type: "customized", subject: null, email_content: "Please don't delete {SupplierResponseLink} if you want supplier response.", additional_recipient_users: [], additional_recipient_groups: [] },
    ];

    const insertPayloads = staticTemplates.map(t => ({
      company_id: companyId || null,
      builder_id: builderId || null,
      name: t.name,
      type: t.type,
      subject: t.subject,
      email_content: t.email_content,
      additional_recipient_users: t.additional_recipient_users,
      additional_recipient_groups: t.additional_recipient_groups,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }));

    const inserted = await db.TemplateEmail.bulkCreate(insertPayloads, { returning: true });

    const filtered = inserted.map(inst => {
      const json = inst.toJSON();
      delete json.company_id;
      delete json.builder_id;
      delete json.created_by;
      delete json.updated_by;
      return json;
    });

    const standardCount = filtered.filter(t => t.type === "standard").length;
    const customizedCount = filtered.filter(t => t.type === "customized").length;

    return {
      responseData: {
        templates: keysToCamelCase(filtered),
        counts: {
          total: filtered.length,
          standard: standardCount,
          customized: customizedCount,
        },
      },
      message: "Default email templates created and fetched successfully.",
    };
  }

  const whereClause = { ...orClause };
  if (name) {
    whereClause.name = { [Op.iLike]: `%${name}%` };
  }
  if (type) {
    whereClause.type = type;
  }

  const records = await db.TemplateEmail.findAll({
    where: whereClause,
    order: [["created_at", "ASC"]],
  });

  const absoluteWhereClause = { ...orClause };
  const totalCount = await db.TemplateEmail.count({ where: absoluteWhereClause });
  const standardCount = await db.TemplateEmail.count({ where: { ...absoluteWhereClause, type: "standard" } });
  const customizedCount = await db.TemplateEmail.count({ where: { ...absoluteWhereClause, type: "customized" } });

  const allUserIds = new Set();
  const allGroupIds = new Set();

  records.forEach(row => {
    (row.additional_recipient_users || []).forEach(u => allUserIds.add(u));
    (row.additional_recipient_groups || []).forEach(g => allGroupIds.add(g));
  });

  const userMap = {};
  if (allUserIds.size > 0) {
    const users = await db.Users.findAll({
      where: { users_id: { [Op.in]: Array.from(allUserIds) } },
      attributes: ["users_id", "name"],
    });
    users.forEach(u => userMap[u.users_id] = u.name);
  }

  const groupMap = {};
  if (allGroupIds.size > 0) {
    const groups = await db.UserGroup.findAll({
      where: { user_group_id: { [Op.in]: Array.from(allGroupIds) } },
      attributes: ["user_group_id", "name"],
    });
    groups.forEach(g => groupMap[g.user_group_id] = g.name);
  }

  const filtered = records.map(inst => {
    const json = inst.toJSON();

    json.additional_recipient_users = (json.additional_recipient_users || []).map(id => ({
      id,
      name: userMap[id] || null,
    }));

    json.additional_recipient_groups = (json.additional_recipient_groups || []).map(id => ({
      id,
      name: groupMap[id] || null,
    }));

    delete json.company_id;
    delete json.builder_id;
    delete json.created_by;
    delete json.updated_by;
    return json;
  });

  return {
    responseData: {
      templates: keysToCamelCase(filtered),
      counts: {
        total: totalCount,
        standard: standardCount,
        customized: customizedCount,
      },
    },
    message: "Template emails fetched successfully.",
  };
}

/* ---------------------------------
   UPDATE TEMPLATE EMAIL
---------------------------------- */
export async function updateTemplateEmailService({ id, builderId, companyId, userId, payload }) {
  const {
    subject,
    email_content,
    additional_recipient_users,
    additional_recipient_groups,
  } = payload;

  const template = await db.TemplateEmail.findOne({
    where: {
      template_email_id: id,
      [Op.or]: [
        { builder_id: builderId },
        { company_id: companyId },
      ],
    },
  });

  if (!template) {
    const error = new Error("Template email not found or unauthorized access.");
    error.status = 404;
    throw error;
  }

  if (!template.is_active) {
    const error = new Error("Template email is inactive.");
    error.status = 404;
    throw error;
  }

  if (Array.isArray(additional_recipient_users) && additional_recipient_users.length > 0) {
    const validUsers = await db.Users.findAll({
      where: {
        users_id: { [Op.in]: additional_recipient_users },
        is_deleted: false,
        is_verified: true,
      },
      attributes: ["users_id"],
    });

    if (validUsers.length !== additional_recipient_users.length) {
      const error = new Error("One or more recipient users are invalid or do not belong to this builder.");
      error.status = 400;
      throw error;
    }
  }

  if (Array.isArray(additional_recipient_groups) && additional_recipient_groups.length > 0) {
    const validGroups = await db.UserGroup.findAll({
      where: {
        user_group_id: { [Op.in]: additional_recipient_groups },
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId },
        ],
      },
      attributes: ["user_group_id", "is_active"],
    });

    if (validGroups.length !== additional_recipient_groups.length) {
      const error = new Error("One or more user groups are invalid.");
      error.status = 400;
      throw error;
    }

    const inactiveGroup = validGroups.find(g => !g.is_active);
    if (inactiveGroup) {
      const error = new Error("One or more user groups are inactive.");
      error.status = 400;
      throw error;
    }
  }

  const updateFields = {};
  if (subject !== undefined) {
    updateFields.subject = subject;
  }
  if (email_content !== undefined) {
    updateFields.email_content = email_content;
  }
  if (additional_recipient_users !== undefined) {
    updateFields.additional_recipient_users = additional_recipient_users;
  }
  if (additional_recipient_groups !== undefined) {
    updateFields.additional_recipient_groups = additional_recipient_groups;
  }

  updateFields.updated_by = userId;
  updateFields.updated_at = new Date();

  await template.update(updateFields);

  const updatedJson = template.toJSON();

  let usersRecipient = [];
  if (updatedJson.additional_recipient_users?.length) {
    const usersResult = await db.Users.findAll({
      where: { users_id: { [Op.in]: updatedJson.additional_recipient_users } },
      attributes: [["users_id", "id"], "name"],
    });
    usersRecipient = usersResult.map(u => u.toJSON());
  }

  let userGroups = [];
  if (updatedJson.additional_recipient_groups?.length) {
    const groupsResult = await db.UserGroup.findAll({
      where: { user_group_id: { [Op.in]: updatedJson.additional_recipient_groups } },
      attributes: [["user_group_id", "id"], "name"],
    });
    userGroups = groupsResult.map(g => g.toJSON());
  }

  return keysToCamelCase({
    ...updatedJson,
    additional_recipient_users: usersRecipient,
    additional_recipient_groups: userGroups,
  });
}

/* ---------------------------------
   DELETE TEMPLATE EMAIL
---------------------------------- */
export async function deleteTemplateEmailService({ template_email_id, builderId, companyId, userId }) {
  // Validate builder
  const validBuilder = await db.Builder.findOne({
    where: { builder_id: builderId },
    attributes: ["builder_id"],
  });

  if (!validBuilder) {
    const error = new Error("Invalid builder.");
    error.status = 400;
    throw error;
  }

  // Validate user
  const validUser = await db.Users.findOne({
    where: { users_id: userId },
    attributes: ["users_id"],
  });

  if (!validUser) {
    const error = new Error("Invalid user.");
    error.status = 400;
    throw error;
  }

  // Validate template exists and belongs to builder
  const template = await db.TemplateEmail.findOne({
    where: {
      template_email_id,
      company_id: companyId,
      builder_id: builderId,
    },
    attributes: ["template_email_id"],
  });

  if (!template) {
    const error = new Error("Template email not found or does not belong to this builder.");
    error.status = 404;
    throw error;
  }

  // Delete
  await db.TemplateEmail.destroy({
    where: { template_email_id },
  });

  return null;
}

/* ---------------------------------
   TOGGLE TEMPLATE EMAIL IS_ACTIVE
---------------------------------- */
export async function updateTemplateEmailIsActiveService({ id, builderId, companyId, userId }) {
  if (!id) {
    const error = new Error("template_email_id is required");
    error.status = 400;
    throw error;
  }

  const template = await db.TemplateEmail.findOne({
    where: {
      template_email_id: id,
      [Op.or]: [
        { builder_id: builderId || null },
        { company_id: companyId || null },
      ],
    },
  });

  if (!template) {
    const error = new Error("Template email not found in your scope");
    error.status = 404;
    throw error;
  }

  const newStatus = !template.is_active;

  await template.update({
    is_active: newStatus,
    updated_by: userId,
    updated_at: new Date(),
  });

  return keysToCamelCase(template.toJSON());
}
