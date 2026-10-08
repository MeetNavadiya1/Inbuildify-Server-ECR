import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase, keysToSnakeCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

/**
 * Creates a new Supplier with associated contacts and documents.
 */
export async function createSupplierService(data, companyId, builderId, userId) {

  const {
    Supplier,

    SupplierContacts,

    State,

    sequelize,
  } = db;
  const transaction = await sequelize.transaction();
  try {
    const {
      company_name,
      abn,
      description,
      contact_name,
      primary_phone,
      secondary_phone,
      website,
      address_line1,
      city,
      state_id,
      country_id,
      zip_code,
      lead_time,
      status,
      email,
      supplier_type_id,
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_received,
      induction_pack_url,
      contacts = [],
    } = data;

    // 1. Duplicate check
    const duplicate = await Supplier.findOne({
      where: {
        company_name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("company_name")),
          company_name.toLowerCase().trim(),
        ),
        company_id: companyId,
        builder_id: builderId,
        is_sample_data: false,
      },
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return {
        error: { status: 400, message: "Supplier with this name already exists." },
      };
    }

    // 2. Validate state_id
    if (state_id) {
      const stateExists = await State.findByPk(state_id, { transaction });
      if (!stateExists) {
        await transaction.rollback();
        return { error: { status: 400, message: "Invalid state_id." } };
      }
    }

    // 3. Create the supplier
    const supplier = await Supplier.create(
      {
        company_id: companyId,
        builder_id: builderId,
        company_name: company_name.trim(),
        abn,
        description,
        contact_name,
        primary_phone,
        secondary_phone,
        website,
        address_line1,
        city,
        state_id,
        country_id: country_id || null,
        zip_code,
        lead_time,
        status: status !== undefined ? status : true,
        email,
        supplier_type_id: supplier_type_id || [],
        work_cover_url,
        pl_insurance_url,
        white_card_url,
        fork_lift_license_url,
        trade_license_url,
        induction_pack_received: induction_pack_received || false,
        induction_pack_url,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // 4. Create contacts
    let createdContacts = [];
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const contactsToCreate = contacts.map((c) => ({
        ...keysToSnakeCase(c),
        supplier_id: supplier.supplier_id,
      }));
      createdContacts = await SupplierContacts.bulkCreate(contactsToCreate, {
        transaction,
      });
    }

    await transaction.commit();

    // Fetch the final supplier with all details
    return await getSupplierByIdService(
      supplier.supplier_id,
      builderId,
      companyId,
    );
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * Gets all suppliers with filtering and pagination.
 */
export async function getAllSuppliersService({
  companyId,
  builderId,
  filters = {},
}) {

  const {
    Supplier,
    SupplierType,

  } = db;
  const {
    company_name,
    phone,
    email,
    website,
    status,
    induction,
    supplier_type_id,
  } = filters;

  const where = {
    company_id: companyId,
    builder_id: builderId,
  };

  if (company_name) {
    where.company_name = { [Op.iLike]: `%${company_name}%` };
  }

  if (phone) {
    where[Op.or] = [
      { primary_phone: { [Op.iLike]: `%${phone}%` } },
      { secondary_phone: { [Op.iLike]: `%${phone}%` } },
    ];
  }

  if (email) {
    // A partial match now the column is a single string, matching how
    // company_name and website are searched above.
    where.email = { [Op.iLike]: `%${email}%` };
  }

  if (website) {
    where.website = { [Op.iLike]: `%${website}%` };
  }

  if (status !== undefined) {
    where.status = status === "true";
  }

  if (induction !== undefined) {
    where.induction_pack_received = induction === "true";
  }

  if (supplier_type_id) {
    where.supplier_type_id = { [Op.contains]: [supplier_type_id] };
  }

  const suppliers = await Supplier.findAll({
    where,
    order: [["created_at", "DESC"]],
  });

  const results = await Promise.all(
    suppliers.map(async (s) => {
      const raw = s.get({ plain: true });
      const typeIds = raw.supplier_type_id || [];
      const supplierTypes =
        typeIds.length > 0
          ? await SupplierType.findAll({
            where: { supplier_type_id: { [Op.in]: typeIds } },
            attributes: ["supplier_type_id", "name"],
            order: [["name", "ASC"]],
          })
          : [];

      return {
        ...raw,
        supplier_types: supplierTypes.map((t) => ({
          id: t.supplier_type_id,
          name: t.name,
        })),
      };
    }),
  );

  return { data: keysToCamelCase(results) };
}

/**
 * Gets a specific supplier by ID with all relations.
 */
export async function getSupplierByIdService(supplierId, builderId, companyId) {

  const {
    Supplier,
    SupplierType,
    SupplierContacts,
    SupplierDocuments,

  } = db;
  const supplier = await Supplier.findOne({
    where: {
      supplier_id: supplierId,
      company_id: companyId,
      builder_id: builderId,
    },
    include: [
      { model: SupplierContacts, as: "contacts" },
      { model: SupplierDocuments, as: "documents" },
    ],
  });

  if (!supplier) {
    return { error: { status: 404, message: "Supplier not found." } };
  }

  const raw = supplier.get({ plain: true });
  const typeIds = raw.supplier_type_id || [];
  const supplierTypes =
    typeIds.length > 0
      ? await SupplierType.findAll({
        where: { supplier_type_id: { [Op.in]: typeIds } },
        attributes: [["supplier_type_id", "id"], "name"],
        order: [["name", "ASC"]],
      })
      : [];

  return {
    data: keysToCamelCase({
      ...raw,
      supplier_types: supplierTypes.map((t) => t.get({ plain: true })),
    }),
  };
}

/**
 * Updates a Supplier.
 */
export async function updateSupplierService(
  supplierId,
  data,
  builderId,
  companyId,
  userId,
) {

  const {
    Supplier,
    SupplierType,

    State,

    sequelize,
  } = db;
  const transaction = await sequelize.transaction();
  try {
    const supplier = await Supplier.findOne({
      where: {
        supplier_id: supplierId,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!supplier) {
      await transaction.rollback();
      return { error: { status: 404, message: "Supplier not found." } };
    }

    const {
      company_name,
      email,
      state_id,
      supplier_type_id,
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_url,
    } = data;

    // Duplicate check
    if (
      company_name &&
      company_name.trim().toLowerCase() !== supplier.company_name.toLowerCase()
    ) {
      const duplicate = await Supplier.findOne({
        where: {
          company_name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("company_name")),
            company_name.toLowerCase().trim(),
          ),
          company_id: companyId,
          builder_id: builderId,
          is_sample_data: false,
          supplier_id: { [Op.ne]: supplierId },
        },
        transaction,
      });

      if (duplicate) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: "Another supplier with this name already exists.",
          },
        };
      }
    }

    // Validate state_id
    if (state_id) {
      const stateExists = await State.findByPk(state_id, { transaction });
      if (!stateExists) {
        await transaction.rollback();
        return { error: { status: 400, message: "Invalid state_id." } };
      }
    }

    // Validate supplier_type_id array
    if (supplier_type_id) {
      if (!Array.isArray(supplier_type_id)) {
        await transaction.rollback();
        return {
          error: {
            status: 400,
            message: "supplier_type_id must be an array of UUIDs",
          },
        };
      }
      if (supplier_type_id.length > 0) {
        const checkTypes = await SupplierType.findAll({
          where: {
            supplier_type_id: { [Op.in]: supplier_type_id },
            is_active: true,
            [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
          },
          transaction,
        });
        if (checkTypes.length !== supplier_type_id.length) {
          await transaction.rollback();
          return {
            error: {
              status: 400,
              message: "One or more supplier_type_id values are invalid",
            },
          };
        }
      }
    }

    // Gather old URLs for cleanup
    const oldUrls = {
      work_cover_url: supplier.work_cover_url,
      pl_insurance_url: supplier.pl_insurance_url,
      white_card_url: supplier.white_card_url,
      fork_lift_license_url: supplier.fork_lift_license_url,
      trade_license_url: supplier.trade_license_url,
      induction_pack_url: supplier.induction_pack_url,
    };

    // Update payload
    const updateData = {
      ...keysToSnakeCase(data),
      updated_by: userId,
      updated_at: new Date(),
    };

    await supplier.update(updateData, { transaction });

    await transaction.commit();

    // S3 Cleanup
    const newUrls = {
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_url,
    };

    Object.keys(newUrls).forEach((key) => {
      if (
        newUrls[key] !== undefined &&
        oldUrls[key] &&
        oldUrls[key] !== newUrls[key]
      ) {
        deleteFromS3(oldUrls[key]).catch((err) =>
          console.error(`Error deleting old ${key} from S3:`, err),
        );
      }
    });

    return await getSupplierByIdService(supplierId, builderId, companyId);
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * Deletes a Supplier and associated data.
 */
export async function deleteSupplierService(supplierId, builderId, companyId) {

  const {
    Supplier,

    SupplierContacts,
    SupplierDocuments,
    SupplierSupplierTypeMap,

    ColorCategory,
    ColorItem,
    sequelize,
  } = db;
  const transaction = await sequelize.transaction();
  try {
    const supplier = await Supplier.findOne({
      where: {
        supplier_id: supplierId,
        company_id: companyId,
        builder_id: builderId,
      },
      transaction,
    });

    if (!supplier) {
      await transaction.rollback();
      return {
        error: { status: 404, message: "Supplier not found or unauthorized." },
      };
    }

    const docs = await SupplierDocuments.findAll({
      where: { supplier_id: supplierId },
      transaction,
    });

    // database actions
    await ColorCategory.update(
      {
        suppliers: sequelize.fn(
          "array_remove",
          sequelize.col("suppliers"),
          supplierId,
        ),
      },
      {
        where: { suppliers: { [Op.contains]: [supplierId] } },
        transaction,
      },
    );

    await ColorItem.update(
      { supplier_id: null },
      { where: { supplier_id: supplierId }, transaction },
    );

    await SupplierSupplierTypeMap.destroy({
      where: { supplier_id: supplierId },
      transaction,
    });
    await SupplierContacts.destroy({
      where: { supplier_id: supplierId },
      transaction,
    });
    await SupplierDocuments.destroy({
      where: { supplier_id: supplierId },
      transaction,
    });
    await supplier.destroy({ transaction });

    await transaction.commit();

    // S3 cleanup
    const s3Urls = new Set();
    [
      supplier.work_cover_url,
      supplier.pl_insurance_url,
      supplier.white_card_url,
      supplier.fork_lift_license_url,
      supplier.trade_license_url,
      supplier.induction_pack_url,
    ].forEach((url) => {
      if (url) {
        s3Urls.add(url);
      }
    });

    docs.forEach((doc) => {
      [
        doc.work_cover_url,
        doc.pl_insurance_url,
        doc.white_card_url,
        doc.fork_lift_license_url,
        doc.trade_license_url,
        doc.induction_pack_url,
      ].forEach((url) => {
        if (url) {
          s3Urls.add(url);
        }
      });
    });

    if (s3Urls.size > 0) {
      Promise.all(Array.from(s3Urls).map((url) => deleteFromS3(url))).catch(
        (err) => console.error("Error during S3 cleanup in service:", err),
      );
    }

    return { success: true };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}
