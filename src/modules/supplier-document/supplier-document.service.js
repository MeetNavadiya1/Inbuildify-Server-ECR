import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

// ============================================================
//        SUPPLIER DOCUMENT CRUD OPERATIONS
// ============================================================

export async function createSupplierDocument(currentUser, payload, files) {
  const { SupplierDocuments, Supplier } = db;
  const builderId = currentUser.builder_id;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const { supplier_id, induction_pack_received } = payload;

  const work_cover_url = files?.workCoverImage?.[0]?.location || payload.work_cover_image || null;
  const pl_insurance_url = files?.plInsuranceImage?.[0]?.location || payload.pl_insurance_image || null;
  const white_card_url = files?.whiteCardImage?.[0]?.location || payload.white_card_image || null;
  const fork_lift_license_url = files?.forkLiftLicenseImage?.[0]?.location || payload.fork_lift_license_image || null;
  const trade_license_url = files?.tradeLicenseImage?.[0]?.location || payload.trade_license_image || null;
  const induction_pack_url = files?.inductionPackImage?.[0]?.location || payload.induction_pack_image || null;

  if (!supplier_id) {
    throw { status: 400, message: "supplier_id is required." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Ownership and status check
    const supplier = await Supplier.findOne({
      where: { supplier_id, builder_id: builderId },
      transaction
    });

    if (!supplier) {
      throw { status: 403, message: "Supplier does not belong to this builder." };
    }

    if (!supplier.status) {
      throw { status: 400, message: "supplier id is inactive." };
    }

    // 2. Induction Pack Validation
    const inductionBoolean = induction_pack_received === true || induction_pack_received === "true" || induction_pack_received === 1 || induction_pack_received === "1";

    if (inductionBoolean && !induction_pack_url) {
      throw { status: 400, message: "induction_pack_url is required when induction_pack_received is true." };
    }

    if (!inductionBoolean && induction_pack_url) {
      throw { status: 400, message: "You cannot provide induction_pack_url when induction_pack_received is false." };
    }

    // 3. Create Document
    const newDoc = await SupplierDocuments.create({
      supplier_id,
      work_cover_url,
      pl_insurance_url,
      white_card_url,
      fork_lift_license_url,
      trade_license_url,
      induction_pack_received: inductionBoolean,
      induction_pack_url
    }, { transaction });

    await transaction.commit();
    return keysToCamelCase(newDoc.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllSupplierDocuments(currentUser, filters = {}) {
  const { SupplierDocuments, Supplier } = db;
  const builderId = currentUser.builder_id;
  const { page = 1, limit = 25 } = filters;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { rows, count } = await SupplierDocuments.findAndCountAll({
    include: [{
      model: Supplier,
      as: "supplier",
      required: true,
      attributes: [],
      where: { builder_id: builderId }
    }],
    order: [["createdAt", "DESC"]],
    limit: limitValue,
    offset,
    distinct: true
  });

  return {
    supplierDocuments: keysToCamelCase(rows.map(r => r.get({ plain: true }))),
    currentPage: pageValue,
    totalPages: Math.ceil(count / limitValue),
    totalRecords: count,
    limit: limitValue
  };
}

export async function updateSupplierDocument(currentUser, id, payload, files) {
  const { SupplierDocuments, Supplier } = db;
  const builderId = currentUser.builder_id;

  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const { induction_pack_received } = payload;

  const work_cover_url = files?.workCoverImage?.[0]?.location || payload.work_cover_image;
  const pl_insurance_url = files?.plInsuranceImage?.[0]?.location || payload.pl_insurance_image;
  const white_card_url = files?.whiteCardImage?.[0]?.location || payload.white_card_image;
  const fork_lift_license_url = files?.forkLiftLicenseImage?.[0]?.location || payload.fork_lift_license_image;
  const trade_license_url = files?.tradeLicenseImage?.[0]?.location || payload.trade_license_image;
  const induction_pack_url = files?.inductionPackImage?.[0]?.location || payload.induction_pack_image;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Fetch existing and validate ownership
    const existing = await SupplierDocuments.findOne({
      where: { supplier_document_id: id },
      include: [{
        model: Supplier,
        as: "supplier",
        required: true,
        where: { builder_id: builderId }
      }],
      transaction
    });

    if (!existing) {
      throw { status: 403, message: "Supplier document does not belong to this builder." };
    }

    // 2. Induction Pack Validation
    const inductionBoolean = induction_pack_received === true || induction_pack_received === "true" || induction_pack_received === 1 || induction_pack_received === "1";

    if (!inductionBoolean && induction_pack_url) {
      throw { status: 400, message: "You cannot provide induction_pack_url when induction_pack_received is false." };
    }

    if (inductionBoolean && !induction_pack_url) {
      throw { status: 400, message: "induction_pack_url is required when induction_pack_received is true." };
    }

    // 3. Handle S3 Deletions and Update fields
    const updateData = { induction_pack_received: inductionBoolean };

    const handleUpdate = async (fieldName, newValue, oldValue) => {
      if (newValue !== undefined && newValue !== null) {
        if (oldValue && newValue !== oldValue) {
          await deleteFromS3(oldValue);
        }
        updateData[fieldName] = newValue;
      }
    };

    await handleUpdate("work_cover_url", work_cover_url, existing.work_cover_url);
    await handleUpdate("pl_insurance_url", pl_insurance_url, existing.pl_insurance_url);
    await handleUpdate("white_card_url", white_card_url, existing.white_card_url);
    await handleUpdate("fork_lift_license_url", fork_lift_license_url, existing.fork_lift_license_url);
    await handleUpdate("trade_license_url", trade_license_url, existing.trade_license_url);
    await handleUpdate("induction_pack_url", induction_pack_url, existing.induction_pack_url);

    await existing.update(updateData, { transaction });

    await transaction.commit();
    return keysToCamelCase(existing.get({ plain: true }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  createSupplierDocument,
  getAllSupplierDocuments,
  updateSupplierDocument
};
