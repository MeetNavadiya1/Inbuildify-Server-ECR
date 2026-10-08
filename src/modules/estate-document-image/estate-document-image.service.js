import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

/**
 * Fetches estate documents with dynamic filtering, associations, and pagination.
 */
export const getEstateDocumentsService = async ({ builderId, companyId, query }) => {
  const { EstateDocuments, Estate, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    estate_id,
    page = 1,
    limit = 10,
  } = query;

  const pageNum = parseInt(page) > 0 ? parseInt(page) : 1;
  const limitNum = parseInt(limit) > 0 && parseInt(limit) <= 100 ? parseInt(limit) : 10;
  const offset = (pageNum - 1) * limitNum;

  // Build Where Clause
  const where = {};
  if (estate_id) {
    where.estate_id = estate_id;
  }

  // Scoping on joined Estate model
  const estateWhere = {
    [Op.or]: [
      { company_id: companyId },
      { builder_id: builderId },
    ],
  };

  const { count: totalRecords, rows: documents } = await EstateDocuments.findAndCountAll({
    where,
    include: [
      {
        model: Estate,
        as: "estate",
        where: estateWhere,
        attributes: ["estate_id", "name"],
        required: true, // INNER JOIN since filter is mandatory
      },
    ],
    limit: limitNum,
    offset,
    order: [["createdAt", "DESC"]],
  });

  // Transform results to match legacy nested structure
  const formattedDocs = documents.map((doc) => {
    const docJson = doc.toJSON();
    return {
      estate_document_id: docJson.estate_document_id,
      estate: {
        id: docJson.estate?.estate_id || null,
        name: docJson.estate?.name || null,
      },
      document_name: docJson.document_name,
      file_url: docJson.file_url,
      created_at: docJson.createdAt,
      created_by: docJson.created_by,
      uploaded_at: docJson.uploaded_at,
      uploaded_by: docJson.uploaded_by,
    };
  });

  return {
    data: keysToCamelCase(formattedDocs),
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalRecords / limitNum),
      totalRecords,
      limit: limitNum,
    },
  };
};

/**
 * Fetches estate images with dynamic resolution of the target estate.
 */
export const getEstateImagesService = async ({ builderId, companyId, userId, query }) => {
  const { EstateImages, Estate, Sequelize, sequelize } = db;
  const { Op } = Sequelize;

  let { estate_id } = query;

  const transaction = await sequelize.transaction();
  try {
    // 1. Resolve Target Estate ID
    if (!estate_id) {
      const existingEstate = await Estate.findOne({
        where: {
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
        order: [["createdAt", "ASC"]],
        transaction,
      });

      if (!existingEstate) {
        const newEstate = await Estate.create(
          {
            name: "Default Estate",
            company_id: companyId,
            builder_id: builderId,
            created_at: new Date(),
          },
          { transaction },
        );
        estate_id = newEstate.estate_id;
      } else {
        estate_id = existingEstate.estate_id;
      }
    }

    // 2. Ensure Estate Image Entry Exists
    const imageExists = await EstateImages.findOne({
      where: { estate_id },
      transaction,
    });

    if (!imageExists) {
      await EstateImages.create(
        {
          estate_id,
          image_url: null,
          uploaded_at: new Date(),
          uploaded_by: userId,
        },
        { transaction },
      );
    }

    await transaction.commit();

    // 3. Final Fetch
    const images = await EstateImages.findAll({
      where: { estate_id },
      include: [
        {
          model: Estate,
          as: "estate",
          where: {
            [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          },
          attributes: ["estate_id", "name"],
          required: true,
        },
      ],
      order: [["uploaded_at", "DESC"]],
    });

    // 4. Mapping & Formatting
    const formattedImages = images.map((img) => {
      const imgJson = img.toJSON();
      return {
        estate_image_id: imgJson.estate_image_id,
        estate: {
          id: imgJson.estate?.estate_id || null,
          name: imgJson.estate?.name || null,
        },
        image_url: imgJson.image_url,
        uploaded_at: imgJson.uploaded_at,
        uploaded_by: imgJson.uploaded_by,
      };
    });

    const responseData = keysToCamelCase(formattedImages);

    // Return single object if only one record, array if multiple (Parity with legacy)
    return responseData.length === 1 ? responseData[0] : responseData;
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates an estate image with S3 cleanup and scoping validation.
 */
export const updateEstateImageService = async ({ id, builderId, companyId, userId, data }) => {
  const { EstateImages, Estate, Sequelize, sequelize } = db;
  const { Op } = Sequelize;

  // Handle both possible field names from request
  const image_url =
    (data.imageUrl === "" ? null : data.imageUrl) ||
    (data.image_url === "" ? null : data.image_url);

  const transaction = await sequelize.transaction();
  try {
    // 1. Validation & Scoping
    const existingImage = await EstateImages.findOne({
      where: { estate_image_id: id },
      include: [
        {
          model: Estate,
          as: "estate",
          where: {
            [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingImage) {
      const error = new Error("Estate image not found or access denied");
      error.status = 404;
      throw error;
    }

    // 2. S3 Cleanup
    if (image_url !== undefined) {
      if (!image_url) {
        if (existingImage.image_url) {
          await deleteFromS3(existingImage.image_url);
        }
      } else if (existingImage.image_url && existingImage.image_url !== image_url) {
        await deleteFromS3(existingImage.image_url);
      }
    }

    // 3. Update
    await existingImage.update(
      {
        image_url,
        uploaded_by: userId,
        uploaded_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    // 4. Final Fetch for Response structure parity
    const updated = await EstateImages.findOne({
      where: { estate_image_id: id },
      include: [
        {
          model: Estate,
          as: "estate",
          attributes: ["estate_id", "name"],
        },
      ],
    });

    const updatedJson = updated.toJSON();
    return keysToCamelCase({
      estate_image_id: updatedJson.estate_image_id,
      estate: {
        id: updatedJson.estate?.estate_id || null,
        name: updatedJson.estate?.name || null,
      },
      image_url: updatedJson.image_url,
      uploaded_at: updatedJson.uploaded_at,
      uploaded_by: updatedJson.uploaded_by,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Creates an estate document with validation, duplicate check, and scoping.
 */
export const createEstateDocumentService = async ({ builderId, companyId, userId, data }) => {
  const { EstateDocuments, Estate, Sequelize, sequelize } = db;
  const { Op } = Sequelize;

  const { estate_id, document_name } = data;
  const file_url =
    (data.fileUrl === "" ? null : data.fileUrl) ||
    (data.file_url === "" ? null : data.file_url);

  // 1. Validation
  if (!estate_id) {
    const error = new Error("Estate ID is required");
    error.status = 400;
    throw error;
  }
  if (!document_name) {
    const error = new Error("Document name is required");
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 2. Scoping Check
    const estate = await Estate.findOne({
      where: {
        estate_id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!estate) {
      const error = new Error("Estate not found or access denied");
      error.status = 404;
      throw error;
    }

    // 3. Duplicate Check
    const duplicate = await EstateDocuments.findOne({
      where: {
        estate_id,
        document_name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("document_name")),
          "=",
          document_name.trim().toLowerCase(),
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Document with this name already exists for this estate");
      error.status = 400;
      throw error;
    }

    // 4. Creation
    const newDoc = await EstateDocuments.create(
      {
        estate_id,
        document_name: document_name.trim(),
        file_url,
        created_by: userId,
        uploaded_by: userId,
        uploaded_at: new Date(),
        createdAt: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    // 5. Final Fetch for Response structure parity
    const created = await EstateDocuments.findOne({
      where: { estate_document_id: newDoc.estate_document_id },
      include: [
        {
          model: Estate,
          as: "estate",
          attributes: ["estate_id", "name"],
        },
      ],
    });

    const createdJson = created.toJSON();
    return keysToCamelCase({
      estate_document_id: createdJson.estate_document_id,
      estate: {
        id: createdJson.estate?.estate_id || null,
        name: createdJson.estate?.name || null,
      },
      document_name: createdJson.document_name,
      file_url: createdJson.file_url,
      created_at: createdJson.createdAt,
      created_by: createdJson.created_by,
      uploaded_at: createdJson.uploaded_at,
      uploaded_by: createdJson.uploaded_by,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * UPDATES AN ESTATE DOCUMENT WITH SCOPING AND S3 CLEANUP
 */
export const updateEstateDocumentService = async ({ id, builderId, companyId, userId, data }) => {
  const { EstateDocuments, Estate, Sequelize, sequelize } = db;
  const { Op } = Sequelize;

  // Handle both possible field names from request
  const file_url =
    (data.fileUrl === "" ? null : data.fileUrl) ||
    (data.file_url === "" ? null : data.file_url);

  const transaction = await sequelize.transaction();
  try {
    // 1. Validation & Scoping
    const existingDoc = await EstateDocuments.findOne({
      where: { estate_document_id: id },
      include: [
        {
          model: Estate,
          as: "estate",
          where: {
            [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingDoc) {
      const error = new Error("Estate document not found or access denied");
      error.status = 404;
      throw error;
    }

    // 2. S3 Cleanup
    if (file_url !== undefined) {
      if (!file_url) {
        if (existingDoc.file_url) {
          await deleteFromS3(existingDoc.file_url);
        }
      } else if (existingDoc.file_url && existingDoc.file_url !== file_url) {
        await deleteFromS3(existingDoc.file_url);
      }
    }

    // 3. Update
    await existingDoc.update(
      {
        document_name: data.document_name,
        file_url: file_url !== undefined ? file_url : existingDoc.file_url,
        uploaded_by: userId,
        uploaded_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    // 4. Final Fetch for Response structure parity
    const updated = await EstateDocuments.findOne({
      where: { estate_document_id: id },
      include: [
        {
          model: Estate,
          as: "estate",
          attributes: ["estate_id", "name"],
        },
      ],
    });

    const updatedJson = updated.toJSON();
    return keysToCamelCase({
      estate_document_id: updatedJson.estate_document_id,
      estate: {
        id: updatedJson.estate?.estate_id || null,
        name: updatedJson.estate?.name || null,
      },
      document_name: updatedJson.document_name,
      file_url: updatedJson.file_url,
      created_at: updatedJson.createdAt,
      created_by: updatedJson.created_by,
      uploaded_at: updatedJson.uploaded_at,
      uploaded_by: updatedJson.uploaded_by,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  getEstateDocumentsService,
  getEstateImagesService,
  updateEstateImageService,
  createEstateDocumentService,
  updateEstateDocumentService,
};
