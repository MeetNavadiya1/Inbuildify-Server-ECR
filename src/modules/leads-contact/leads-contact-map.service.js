import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Sequelize } from "sequelize";
import { checkLeadLockStatus } from "../../helper/leadLock.helper.js";

const { Op } = Sequelize;

async function syncJobCustomerContact(leadsId, transaction) {
  const { Opportunity, Job, LeadsContactMap } = db;

  const opportunity = await Opportunity.findOne({
    where: { leads_id: leadsId },
    attributes: ["opportunity_id"],
    transaction,
  });

  if (!opportunity) return;

  const job = await Job.findOne({
    where: { opportunity_id: opportunity.opportunity_id },
    attributes: ["job_id", "customer_contact_id"],
    transaction,
  });

  if (!job) return;

  const firstMap = await LeadsContactMap.findOne({
    where: { leads_id: leadsId },
    order: [["created_at", "ASC"]],
    transaction,
  });

  const customerContactId = firstMap?.contact_id || null;

  if (job.customer_contact_id !== customerContactId) {
    await job.update({ customer_contact_id: customerContactId }, { transaction });
  }
}

/**
 * Get contacts by lead ID
 * @param {Object} reqUser - Current user object
 * @param {string} leads_id - Leads ID
 * @returns {Promise<Array>} - List of formatted contacts
 */
export async function getContactsByLeadId(reqUser, leads_id) {
  const { Leads, LeadsContactMap, Users, Address } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized" };
  }

  // Validate lead ownership
  const orConditions = [];
  if (companyId) {
    orConditions.push({ company_id: companyId });
  }
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  }

  const lead = await Leads.findOne({
    where: {
      leads_id,
      [Op.or]: orConditions,
    },
    attributes: ["leads_id"],
  });

  if (!lead) {
    throw { status: 404, message: "Lead not found or does not belong to your organization" };
  }

  // Fetch lead contacts with included user and address
  const maps = await LeadsContactMap.findAll({
    where: { leads_id },
    include: [
      {
        model: Users,
        as: "contact",
        include: [
          {
            model: Address,
            as: "address",
            required: false,
          },
        ],
      },
    ],
    order: [["created_at", "ASC"]],
  });

  // Format to match original raw SQL response structure
  const formattedData = maps.map((map) => {
    const plainMap = map.get({ plain: true });
    const contact = plainMap.contact || {};
    const address = contact.address || null;

    // Mapping to match the original response structure exactly
    return keysToCamelCase({
      id: plainMap.id,
      leads_id: plainMap.leads_id,
      contact_id: plainMap.contact_id,
      users_id: contact.users_id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      secondary_phone: contact.secondary_phone,
      remark: contact.remark,
      role_id: contact.role_id,
      address_id: contact.address_id,
      has_login: contact.has_login,
      is_active: contact.is_active,
      address: address ? {
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        zip_code: address.zip_code,
        country_id: address.country_id,
        state_id: address.state_id,
      } : null,
      contact_created_at: contact.createdAt,
      contact_updated_at: contact.updatedAt,
      created_at: plainMap.createdAt,
      updated_at: plainMap.updatedAt,
    });
  });

  return formattedData;
}

/**
 * Create a new lead contact map
 * @param {string} leads_id - Leads ID
 * @param {string} contact_id - Contact ID
 * @param {string} builderId - Builder ID
 * @param {string} companyId - Company ID
 * @returns {Promise<Object>} - Formatted mapped contact data
 */
export async function createLeadContactMap(leads_id, contact_id, builderId, companyId) {
  const { Leads, LeadsContactMap, Users, Role, Address, sequelize } = db;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized" };
  }

  const orConditions = [];
  if (companyId) orConditions.push({ company_id: companyId });
  if (builderId) orConditions.push({ builder_id: builderId });

  // 1. Verify lead existence and ownership
  const lead = await Leads.findOne({
    where: {
      leads_id,
      [Op.or]: orConditions,
    },
    attributes: ["leads_id"],
  });

  if (!lead) {
    throw { status: 404, message: "Lead not found or does not belong to your organization" };
  }

  await checkLeadLockStatus(leads_id);

  // 2. Verify contact existence and role
  const contactUser = await Users.findOne({
    where: { users_id: contact_id, is_deleted: false },
    include: [
      { model: Role, as: "role", attributes: ["name"] },
      { model: Address, as: "address" },
    ],
  });

  if (!contactUser) {
    throw { status: 404, message: "Contact not found or does not belong to your organization" };
  }

  if (contactUser.is_active !== true) {
    throw { status: 400, message: "Contact is inactive" };
  }

  if (contactUser.role?.name !== "Contact") {
    throw { status: 400, message: "The provided user does not have the Contact role" };
  }

  const t = await sequelize.transaction();
  try {
    // 3. Check for duplicates
    const existingMapping = await LeadsContactMap.findOne({
      where: { leads_id, contact_id },
      transaction: t,
    });

    if (existingMapping) {
      throw { status: 409, message: "This contact is already mapped to the lead" };
    }

    // 4. Check limit (max 2 contacts)
    const mapCount = await LeadsContactMap.count({
      where: { leads_id },
      transaction: t,
    });

    if (mapCount >= 2) {
      throw { status: 400, message: "A lead can have a maximum of 2 contacts." };
    }

    // 5. Create mapping
    const newMap = await LeadsContactMap.create(
      { leads_id, contact_id },
      { transaction: t }
    );

    await syncJobCustomerContact(leads_id, t);

    await t.commit();

    const plainMap = newMap.get({ plain: true });
    const contact = contactUser.get({ plain: true });
    const address = contact.address || null;

    // Formatting exactly as the raw SQL version for response parity
    return keysToCamelCase({
      id: plainMap.id,
      leads_id: plainMap.leads_id,
      contact_id: plainMap.contact_id,
      users_id: contact.users_id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      secondary_phone: contact.secondary_phone,
      remark: contact.remark,
      role_id: contact.role_id,
      address_id: contact.address_id,
      has_login: contact.has_login,
      is_active: contact.is_active,
      address: address ? {
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        zip_code: address.zip_code,
        country_id: address.country_id,
        state_id: address.state_id,
      } : null,
      contact_created_at: contact.createdAt,
      contact_updated_at: contact.updatedAt,
      created_at: plainMap.createdAt,
      updated_at: plainMap.updatedAt,
    });
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Delete a lead contact mapping
 * @param {string} id - LeadsContactMap ID
 * @param {string} builderId - Builder ID
 * @param {string} companyId - Company ID
 */
export async function deleteLeadContactMap(id, builderId, companyId) {
  const { Leads, LeadsContactMap } = db;
  
  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized" };
  }

  const orConditions = [];
  if (companyId) orConditions.push({ company_id: companyId });
  if (builderId) orConditions.push({ builder_id: builderId });

  const t = await db.sequelize.transaction();

  try {
    // Verify the mapping exists and the user owns the lead it's attached to
    const mapping = await LeadsContactMap.findOne({
      where: { id },
      include: [{
        model: Leads,
        as: "lead",
        attributes: ["leads_id"],
        where: {
          [Op.or]: orConditions,
        },
        required: true,
      }],
      transaction: t,
    });

    if (!mapping) {
      throw { status: 404, message: "Lead contact mapping not found or does not belong to your organization" };
    }

    await checkLeadLockStatus(mapping.leads_id, t);
    const leadsId = mapping.leads_id;

    await mapping.destroy({ transaction: t });

    await syncJobCustomerContact(leadsId, t);

    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export default {
  getContactsByLeadId,
  createLeadContactMap,
  deleteLeadContactMap,
};
