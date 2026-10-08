import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Sequelize } from "sequelize";

const { Op } = Sequelize;

/**
 * Get all business contacts for a builder/company (paginated)
 * @param {Object} reqUser - Current user object
 * @param {Object} queryParams - Query parameters (page, limit)
 * @returns {Promise<Object>} - Paginated business contacts
 */
export async function getAllBusinessContactsService(reqUser, queryParams) {
  const { BusinessContact, Leads, Country, State } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: Missing builder or company ID." };
  }

  const { page = 1, limit = 25 } = queryParams;
  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  // Organization filter via Leads
  const orConditions = [];
  if (builderId) {
    orConditions.push({ builder_id: builderId });
  } else {
    orConditions.push({ company_id: companyId });
  }

  const { count, rows } = await BusinessContact.findAndCountAll({
    include: [
      {
        model: Leads,
        as: "lead",
        where: { [Op.or]: orConditions },
        attributes: [], // We don't need lead fields, just the join
        required: true,
      },
      {
        model: Country,
        as: "country",
        attributes: ["name"],
        required: false,
      },
      {
        model: State,
        as: "state",
        attributes: ["name"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
    distinct: true, // Important for accurate count with joins
  });

  const transformedRows = rows.map((row) => {
    const plain = row.get({ plain: true });
    const transformed = keysToCamelCase(plain);
    
    // Parity: Map country_name and state_name
    transformed.countryName = plain.country?.name || null;
    transformed.stateName = plain.state?.name || null;
    
    // Cleanup if necessary (optional, but keep it clean)
    delete transformed.country;
    delete transformed.state;
    
    return transformed;
  });

  return {
    businessContacts: transformedRows,
    pagination: {
      totalRecords: count,
      currentPage: pageValue,
      limit: limitValue,
      totalPages: Math.ceil(count / limitValue),
    },
  };
}

/**
 * Get a single business contact by ID
 * @param {string} id - Business contact ID
 * @param {Object} reqUser - Current user object
 * @returns {Promise<Object>} - Business contact details
 */
export async function getBusinessContactByIdService(id, reqUser) {
  const { BusinessContact, Leads, Country, State } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: Missing builder or company ID." };
  }

  const orConditions = [];
  if (companyId) orConditions.push({ company_id: companyId });
  if (builderId) orConditions.push({ builder_id: builderId });

  const contact = await BusinessContact.findOne({
    where: { business_contact_id: id },
    include: [
      {
        model: Leads,
        as: "lead",
        where: { [Op.or]: orConditions },
        attributes: [],
        required: true,
      },
      {
        model: Country,
        as: "country",
        attributes: ["name"],
        required: false,
      },
      {
        model: State,
        as: "state",
        attributes: ["name"],
        required: false,
      },
    ],
  });

  if (!contact) {
    throw { status: 404, message: "Business contact not found." };
  }

  const plain = contact.get({ plain: true });
  const transformed = keysToCamelCase(plain);

  // Parity: Map country_name and state_name
  transformed.countryName = plain.country?.name || null;
  transformed.stateName = plain.state?.name || null;
  delete transformed.country;
  delete transformed.state;

  return transformed;
}

/**
 * Get business contacts by leads ID
 * @param {Object} reqUser - Current user object
 * @param {string} leads_id - Leads ID
 * @returns {Promise<Array>} - List of business contacts
 */
export async function getBusinessContactsByLeadsId(reqUser, leads_id) {
  const { Leads, BusinessContact } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
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

  const contacts = await BusinessContact.findAll({
    where: { leads_id },
    order: [["created_at", "DESC"]],
  });

  return keysToCamelCase(contacts.map(c => c.get({ plain: true })));
}

/**
 * Create a new business contact for a lead
 * @param {Object} reqUser - Current user object
 * @param {Object} data - Business contact data
 * @returns {Promise<Object>} - Created business contact
 */
export async function createBusinessContactService(reqUser, data) {
  const { Leads, BusinessContact, State, sequelize } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  const {
    leads_id,
    contact_type,
    name,
    email,
    phone,
    address1,
    address2,
    city,
    zip_code,
    country_id,
    state_id,
    abn_number,
    acn_number,
  } = data;

  const t = await sequelize.transaction();

  try {
    // 1. Validate lead ownership
    const orConditions = [];
    if (companyId) {
      orConditions.push({ company_id: companyId });
    }
    if (builderId) {
      orConditions.push({ builder_id: builderId });
    }

    if (orConditions.length === 0) {
      throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
    }

    const lead = await Leads.findOne({
      where: {
        leads_id,
        [Op.or]: orConditions,
      },
      attributes: ["leads_id", "status"],
      transaction: t,
    });

    if (!lead) {
      throw { status: 404, message: "Lead not found or does not belong to your organization" };
    }

    // 2. Metadata validation (State/Country consistency)
    const parsedCountryId = country_id === "" ? null : country_id;
    const parsedStateId = state_id === "" ? null : state_id;

    if (parsedStateId) {
      if (!parsedCountryId) {
        throw { status: 400, message: "Country is required when state is provided." };
      }

      const stateCheck = await State.findOne({
        where: { state_id: parsedStateId, country_id: parsedCountryId },
        transaction: t,
      });

      if (!stateCheck) {
        throw { status: 400, message: "Invalid state for the selected country." };
      }
    }

    // 3. Business rule: Max 1 contact per type for this lead
    const existingTypeCount = await BusinessContact.count({
      where: { leads_id, contact_type },
      transaction: t,
    });

    if (existingTypeCount >= 1) {
      throw { status: 400, message: `Only one contact allowed per type. Type '${contact_type}' already has ${existingTypeCount} contact(s)` };
    }

    // 4. Business rule: Max 4 contacts total for this lead
    const totalCount = await BusinessContact.count({
      where: { leads_id },
      transaction: t,
    });

    if (totalCount >= 4) {
      throw { status: 400, message: `Maximum 4 contacts allowed per lead. This lead already has ${totalCount} contacts` };
    }

    // 5. Create Business Contact
    const newContact = await BusinessContact.create({
      leads_id,
      contact_type,
      name,
      email,
      phone,
      address1,
      address2,
      city,
      zip_code,
      country_id: parsedCountryId,
      state_id: parsedStateId,
      abn_number,
      acn_number,
    }, { transaction: t });

    // 6. Update lead status if it was 'New'
    if (lead.status === "New") {
      await lead.update({ status: "Working", updated_at: new Date() }, { transaction: t });
    }

    await t.commit();
    return keysToCamelCase(newContact.get({ plain: true }));
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Update a business contact
 * @param {string} id - Business contact ID
 * @param {Object} reqUser - Current user object
 * @param {Object} data - Updated data
 * @returns {Promise<Object>} - Updated business contact
 */
export async function updateBusinessContactService(id, reqUser, data) {
  const { BusinessContact, Leads, State, sequelize } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  const t = await sequelize.transaction();

  try {
    // 1. Fetch existing item with Lead for ownership check
    const orConditions = [];
    if (companyId) {
      orConditions.push({ company_id: companyId });
    }
    if (builderId) {
      orConditions.push({ builder_id: builderId });
    }

    if (orConditions.length === 0) {
      throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
    }

    const contact = await BusinessContact.findOne({
      where: { business_contact_id: id },
      include: [
        {
          model: Leads,
          as: "lead",
          where: { [Op.or]: orConditions },
          required: true,
        },
      ],
      transaction: t,
    });

    if (!contact) {
      throw { status: 404, message: "Business contact not found." };
    }

    // 2. Metadata validation (State/Country consistency)
    const { country_id, state_id, ...updateFields } = data;

    // Handle null/empty string for IDs
    let finalCountryId = contact.country_id;
    if (country_id !== undefined) {
      finalCountryId = country_id === "" ? null : country_id;
      updateFields.country_id = finalCountryId;
    }

    let finalStateId = contact.state_id;
    if (state_id !== undefined) {
      finalStateId = state_id === "" ? null : state_id;
      updateFields.state_id = finalStateId;
    }

    if (finalStateId) {
      if (!finalCountryId) {
        throw { status: 400, message: "Country is required when state is provided." };
      }

      const stateCheck = await State.findOne({
        where: { state_id: finalStateId, country_id: finalCountryId },
        transaction: t,
      });

      if (!stateCheck) {
        throw { status: 400, message: "Invalid state for the selected country." };
      }
    }

    // 3. Update fields
    if (Object.keys(updateFields).length === 0 && country_id === undefined && state_id === undefined) {
      throw { status: 400, message: "No fields to update" };
    }

    await contact.update(
      {
        ...updateFields,
        updatedAt: new Date(),
      },
      { transaction: t },
    );

    await t.commit();
    return keysToCamelCase(contact.get({ plain: true }));
  } catch (error) {
    if (t) {
      await t.rollback();
    }
    throw error;
  }
}

/**
 * Delete a business contact
 * @param {string} id - Business contact ID
 * @param {Object} reqUser - Current user object
 * @returns {Promise<Object>} - Empty object
 */
export async function deleteBusinessContactService(id, reqUser) {
  const { BusinessContact, Leads, sequelize } = db;
  const builderId = reqUser?.builder_id;
  const companyId = reqUser?.company_id;

  const t = await sequelize.transaction();

  try {
    // 1. Ownership check
    const orConditions = [];
    if (companyId) {
      orConditions.push({ company_id: companyId });
    }
    if (builderId) {
      orConditions.push({ builder_id: builderId });
    }

    if (orConditions.length === 0) {
      throw { status: 401, message: "Unauthorized: User must belong to either a builder or company" };
    }

    const contact = await BusinessContact.findOne({
      where: { business_contact_id: id },
      include: [
        {
          model: Leads,
          as: "lead",
          where: { [Op.or]: orConditions },
          required: true,
        },
      ],
      transaction: t,
    });

    if (!contact) {
      throw { status: 404, message: "Business contact not found." };
    }

    // 2. Perform delete
    await contact.destroy({ transaction: t });

    await t.commit();
    return {};
  } catch (error) {
    if (t) {
      await t.rollback();
    }
    throw error;
  }
}

export default {
  getAllBusinessContactsService,
  getBusinessContactByIdService,
  getBusinessContactsByLeadsId,
  createBusinessContactService,
  updateBusinessContactService,
  deleteBusinessContactService,
};
