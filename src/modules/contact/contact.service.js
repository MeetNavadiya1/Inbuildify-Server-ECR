import db from "../../config/database/models/postgre-models/index.js";
import emailService from "../../helper/sendEmail.js";
import { generateStrongPassword, validatePasswordPolicy } from "../../utils/password.util.js";

import { keysToCamelCase, encrypt } from "../../utils/common.js";
import { findRoleForCompany, resolveRoleIdForCompany } from "../../helper/rbac.helper.js";
import { Sequelize } from "sequelize";

const { Op } = Sequelize;

/* ------------------------------------------------------------
      LIST CONTACTS
  ------------------------------------------------------------ */
export async function getContacts(currentUser, query) {
  const { Users, Role, Address } = db;
  const builderId = currentUser.builder_id;
  const { search = "", is_active, only_customers, portal_access } = query;

  const where = {
    is_deleted: false,
    builder_id: builderId,
    // Demo contacts stay out of this screen entirely.
    //
    // A contact is a `Users` row under the Contact role, and the importer clones
    // one per demo lead. `Users` is owner-scoped, so a colleague never saw them —
    // but the person who ran the import did, and their Contacts screen came back
    // as a list of demo names they never entered and cannot edit (the seeded rows
    // are read-only; see `sampleDataFlag`). The demo leads that reference them are
    // unaffected: those read through the lead services, not this one.
    //
    // `IS NOT TRUE` rather than `= false`, matching `sampleDataSqlScope`: the
    // column is nullable on rows written before the flag existed, and `NULL =
    // false` is NULL, which would hide real contacts.
    is_sample_data: { [Op.not]: true },
  };

  if (is_active !== undefined) {
    where.is_active = is_active === "true" || is_active === true;
  }

  const extra = [];

  // A customer is a contact set as the customer on at least one job.
  if (only_customers === true || only_customers === "true") {
    extra.push({
      users_id: {
        [Op.in]: Sequelize.literal(
          "(SELECT customer_contact_id FROM job WHERE customer_contact_id IS NOT NULL)",
        ),
      },
    });
  }

  // Portal access, as the chat service defines it: a login that is active.
  // These AND with the Active/Inactive tab rather than replace it.
  if (portal_access === "loginActive") {
    extra.push({ has_login: true, is_active: true });
  } else if (portal_access === "loginInactive") {
    extra.push({ has_login: true, is_active: false });
  } else if (portal_access === "noLogin") {
    // IS NOT TRUE so legacy NULL rows count as "no login".
    extra.push({ has_login: { [Op.not]: true } });
  }

  if (extra.length) {
    where[Op.and] = extra;
  }

  if (search) {
    const searchFilter = `%${search.toLowerCase()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: searchFilter } },
      { email: { [Op.iLike]: searchFilter } },
      { phone: { [Op.iLike]: searchFilter } },
    ];
  }

  const users = await Users.findAll({
    where,
    include: [
      {
        model: Role,
        as: "role",
        where: { name: { [Op.iLike]: "contact" } },
        attributes: [],
      },
      {
        model: Address,
        as: "address",
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return users.map((user) => {
    const plainUser = user.get({ plain: true });
    return keysToCamelCase(plainUser);
  });
}

/* ------------------------------------------------------------
      GET ONE CONTACT
  ------------------------------------------------------------ */
export async function getContactById(currentUser, contact_id) {

  const { Users, Role, Address } = db;
  const user = await Users.findOne({
    where: {
      users_id: contact_id,
      builder_id: currentUser.builder_id,
      is_deleted: false,
    },
    include: [
      {
        model: Role,
        as: "role",
        where: { name: { [Op.iLike]: "contact" } },
        attributes: ["role_id", "name"],
      },
      {
        model: Address,
        as: "address",
        required: false,
      },
    ],
  });

  if (!user) {
    throw { status: 404, message: "Contact not found." };
  }

  return keysToCamelCase(user.get({ plain: true }));
}

/* ------------------------------------------------------------
      CREATE CONTACT
  ------------------------------------------------------------ */
export async function createContact(currentUser, body) {

  const { Users, Role, Address } = db;
  const builderId = currentUser.builder_id;
  const companyId = currentUser.company_id;

  const {
    name,
    email,
    phone,
    secondary_phone,
    remark,
    role_id,
    address: addressJson,
  } = body;

  const t = await db.sequelize.transaction();

  try {
    // Contacts must land on this company's copy of the Contact role. The global
    // template row (company_id IS NULL) is never listed by Role Management, so a
    // contact pinned to it silently ignores everything the admin ticks there.
    let finalRoleId = role_id;
    if (!finalRoleId) {
      const contactRole = await findRoleForCompany("Contact", companyId, {
        transaction: t,
        exact: false,
      });

      if (!contactRole) {
        throw { status: 500, message: "Contact role not found in the system." };
      }

      finalRoleId = contactRole.role_id;
    } else {
      const role = await Role.findOne({
        where: { role_id: finalRoleId },
        transaction: t,
      });

      if (!role) {
        throw { status: 400, message: "Invalid role ID or role does not belong to your account." };
      }

      const roleName = role.name.toLowerCase();
      if (roleName !== "contact") {
        throw { status: 400, message: "Only Contact role is allowed for creating contacts." };
      }

      // A caller may still pass the global Contact role id — normalise it to the
      // company copy so the contact is reachable from the permission grid, and
      // so it is the same row the lead → contact mapping uses.
      finalRoleId = await resolveRoleIdForCompany(finalRoleId, companyId, { transaction: t });
    }

    const existing = await Users.findOne({
      where: { email: { [Op.iLike]: email } },
      transaction: t,
    });

    if (existing) {
      if (existing.builder_id === builderId) {
        throw { status: 400, message: "Email already exists in your contacts." };
      } else {
        throw { status: 400, message: "Email already exists in the system." };
      }
    }

    let addressId = null;
    if (addressJson) {
      const newAddress = await Address.create({
        address_line1: addressJson.address_line1,
        address_line2: addressJson.address_line2,
        city: addressJson.city,
        zip_code: addressJson.zip_code,
        country_id: addressJson.country_id,
        state_id: addressJson.state_id,
      }, { transaction: t });
      addressId = newAddress.address_id;
    }

    const created = await Users.create({
      name,
      email,
      phone,
      secondary_phone,
      remark,
      builder_id: builderId,
      // Stamped like every other user-creating path (lead → contact, Users
      // screen); without it the contact is company-less and drops out of any
      // company-scoped query.
      company_id: companyId,
      address_id: addressId,
      role_id: finalRoleId,
      has_login: false,
      password: null,
      login_id: null,
      is_active: true,
      is_verified: true,
    }, { transaction: t });

    await t.commit();

    return await getContactById(currentUser, created.users_id);
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/* ------------------------------------------------------------
      UPDATE CONTACT
  ------------------------------------------------------------ */
export async function updateContact(currentUser, contact_id, body) {

  const { Users, Address } = db;
  const builderId = currentUser.builder_id;

  const t = await db.sequelize.transaction();

  try {
    const user = await Users.findOne({
      where: {
        users_id: contact_id,
        builder_id: builderId,
        is_deleted: false,
      },
      include: [{ model: Address, as: "address" }],
      transaction: t,
    });

    if (!user) {
      throw { status: 404, message: "Contact not found." };
    }

    const {
      name,
      email,
      phone,
      secondary_phone,
      remark,
      is_active,
      address: addressJson,
    } = body;

    const updateData = {
      name,
      email,
      phone,
      secondary_phone,
      remark,
      is_active,
    };

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const duplicate = await Users.findOne({
        where: { email: { [Op.iLike]: email }, users_id: { [Op.ne]: contact_id } },
        transaction: t,
      });
      if (duplicate) {
        throw { status: 400, message: "Email already exists." };
      }
      if (user.has_login && user.login_id && user.login_id.toLowerCase() === user.email.toLowerCase()) {
        updateData.login_id = email.toLowerCase();
      }
    }

    if (addressJson) {
      if (user.address_id) {
        await Address.update({
          address_line1: addressJson.address_line1,
          address_line2: addressJson.address_line2,
          city: addressJson.city,
          zip_code: addressJson.zip_code,
          country_id: addressJson.country_id,
          state_id: addressJson.state_id,
        }, { where: { address_id: user.address_id }, transaction: t });
      } else {
        const newAddress = await Address.create({
          address_line1: addressJson.address_line1,
          address_line2: addressJson.address_line2,
          city: addressJson.city,
          zip_code: addressJson.zip_code,
          country_id: addressJson.country_id,
          state_id: addressJson.state_id,
        }, { transaction: t });
        updateData.address_id = newAddress.address_id;
      }
    }

    await user.update(updateData, { transaction: t });

    await t.commit();

    return await getContactById(currentUser, contact_id);
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/* ------------------------------------------------------------
      DELETE CONTACT (soft delete)
  ------------------------------------------------------------ */
export async function deleteContact(currentUser, contact_id) {

  const { Users } = db;
  const builderId = currentUser.builder_id;

  const contact = await Users.findOne({
    where: {
      users_id: contact_id,
      builder_id: builderId,
      is_deleted: false,
    },
  });

  if (!contact) {
    throw { status: 404, message: "Contact not found." };
  }

  await contact.update({ is_deleted: true });
  return { contact_id };
}

/* ------------------------------------------------------------
      CONVERT CONTACT → USER
  ------------------------------------------------------------ */
export async function convertContactToUser(currentUser, contact_id, body) {

  const { Users } = db;
  const { role_id } = body;
  const builderId = currentUser.builder_id;

  const t = await db.sequelize.transaction();

  try {
    const contact = await Users.findOne({
      where: {
        users_id: contact_id,
        builder_id: builderId,
        is_deleted: false,
      },
      transaction: t,
    });

    if (!contact) {
      throw { status: 404, message: "Contact not found." };
    }

    if (contact.has_login === true) {
      throw { status: 400, message: "This contact is already a system user." };
    }

    const loginId = contact.email.toLowerCase();

    const loginCheck = await Users.findOne({
      where: { login_id: loginId },
      transaction: t,
    });

    if (loginCheck && loginCheck.users_id !== contact_id) {
      throw { status: 400, message: "This email is already used as a login ID." };
    }

    const password = generateStrongPassword(12);
    if (!validatePasswordPolicy(password)) {
      throw { status: 500, message: "Generated password failed security policy." };
    }

    const encryptedPwd = encrypt(password);

    await contact.update({
      role_id,
      has_login: true,
      login_id: loginId,
      password: encryptedPwd,
      is_active: true,
      is_locked: false,
      is_verified: true,
      next_login_password_change: true,
    }, { transaction: t });

    await UsersToken.destroy({
      where: { user_id: contact_id },
      transaction: t,
    });

    await t.commit();

    try {
      await emailService.sendPasswordEmail(contact.email, loginId, password);
    } catch (emailError) {
      console.error("Error sending password email during conversion:", emailError);
    }

    return {
      user_id: contact_id,
      login_id: loginId,
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export default {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  convertContactToUser,
};
