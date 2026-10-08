import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Creates a new supplier contact.
 */
export async function createSupplierContactService(data, builderId) {
  const { Supplier, SupplierContacts, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const { supplier_id, contact_name, email, phone, contact_type } = data;

    // 1. Verify supplier belongs to this builder
    const supplierRes = await Supplier.findOne({
      where: { supplier_id },
      attributes: ["supplier_id", "builder_id", "status"],
      transaction,
    });

    if (!supplierRes || supplierRes.builder_id !== builderId) {
      await transaction.rollback();
      return {
        error: {
          status: 403,
          message: "Supplier does not belong to this builder.",
        },
      };
    }

    // 2. Check if supplier is active
    if (!supplierRes.status) {
      await transaction.rollback();
      return {
        error: { status: 400, message: "supplier id is inactive." },
      };
    }

    // 3. Validate email format (keeping original logic)
    if (email) {
      if (typeof email !== "string" || !email.includes("@")) {
        await transaction.rollback();
        return { error: { status: 400, message: "Invalid email format." } };
      }
    }

    // 4. Create the contact
    const contact = await SupplierContacts.create(
      {
        supplier_id,
        contact_name,
        email: email || null,
        phone: phone || null,
        contact_type: contact_type || null,
      },
      { transaction },
    );

    await transaction.commit();

    return {
      data: keysToCamelCase(contact.get({ plain: true })),
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * Gets all supplier contacts for a builder, optionally filtered by supplier_id.
 */
export async function getAllSupplierContactsService(builderId, supplierId) {
  const { Supplier, SupplierContacts } = db;

  const where = {};
  if (supplierId) {
    where.supplier_id = supplierId;
  }

  const contacts = await SupplierContacts.findAll({
    where,
    include: [
      {
        model: Supplier,
        as: "supplier",
        where: { builder_id: builderId },
        attributes: [], // We only need it for filtering
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return {
    data: keysToCamelCase(contacts.map((c) => c.get({ plain: true }))),
  };
}

/**
 * Deletes a supplier contact after verifying ownership.
 */
export async function deleteSupplierContactService(
  supplierContactId,
  builderId,
) {
  const { Supplier, SupplierContacts } = db;

  const contact = await SupplierContacts.findOne({
    where: { supplier_contact_id: supplierContactId },
    include: [
      {
        model: Supplier,
        as: "supplier",
        where: { builder_id: builderId },
        attributes: ["builder_id"],
      },
    ],
  });

  if (!contact) {
    return {
      error: {
        status: 404,
        message: "Record not found or does not belong to this builder.",
      },
    };
  }

  await contact.destroy();

  return { success: true };
}

/**
 * Updates a supplier contact after verifying ownership.
 */
export async function updateSupplierContactService(
  supplierContactId,
  data,
  builderId,
) {
  const { Supplier, SupplierContacts } = db;

  const contact = await SupplierContacts.findOne({
    where: { supplier_contact_id: supplierContactId },
    include: [
      {
        model: Supplier,
        as: "supplier",
        where: { builder_id: builderId },
        attributes: ["builder_id"],
      },
    ],
  });

  if (!contact) {
    return {
      error: {
        status: 404,
        message: "Record not found or does not belong to this builder.",
      },
    };
  }

  const { contact_name, email, phone, contact_type } = data;
  const updateData = {};

  if (contact_name !== undefined) updateData.contact_name = contact_name.trim();
  if (email !== undefined) updateData.email = email.trim();
  if (phone !== undefined) updateData.phone = phone.trim();
  if (contact_type !== undefined) updateData.contact_type = contact_type.trim();

  if (Object.keys(updateData).length === 0) {
    return {
      error: { status: 400, message: "No fields provided to update." },
    };
  }

  await contact.update(updateData);

  return {
    data: keysToCamelCase(contact.get({ plain: true })),
  };
}
