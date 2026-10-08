import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

/**
 * Fetches estate stages with dynamic pagination and builder scouting.
 */
export const getAllEstateStagesService = async ({ builderId, query }) => {
  const { EstateStages, Estate } = db;

  const {
    page = 1,
    limit = 25,
    estate_id,
  } = query;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 25;
  const offset = (pageNum - 1) * limitNum;

  // Build Where Clause
  const where = {};
  if (estate_id) {
    where.estate_id = estate_id;
  }

  const { count: totalRecords, rows: stages } = await EstateStages.findAndCountAll({
    where,
    include: [
      {
        model: Estate,
        as: "estate",
        where: { builder_id: builderId },
        attributes: [], // We only need it for the join filter
        required: true,
      },
    ],
    limit: limitNum,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return {
    estateStage: keysToCamelCase(stages.map((s) => s.toJSON())),
    pagination: {
      totalRecords,
      currentPage: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalRecords / limitNum),
    },
  };
};

/**
 * Creates a new estate stage with validation, duplicate check, and scoping.
 */
export const createEstateStageService = async ({ builderId, data }) => {
  const { EstateStages, Estate, sequelize } = db;
  const { estate_id, name, release_date, attach_file } = data;

  // 1. Date Validation
  function isValidDate(dateString) {
    if (!dateString) {
      return true;
    }
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  if (release_date && !isValidDate(release_date)) {
    const error = new Error(`Invalid date: ${release_date}`);
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 2. Estate Existence and Scoping
    const estate = await Estate.findOne({
      where: { estate_id, builder_id: builderId },
      transaction,
    });

    if (!estate) {
      const error = new Error("Estate not found or you do not have permission.");
      error.status = 404;
      throw error;
    }

    // 3. Active Status Check
    if (!estate.status) {
      const error = new Error("Inactive Estate.");
      error.status = 404;
      throw error;
    }

    // 4. Duplicate Check (Case-insensitive)
    const duplicate = await EstateStages.findOne({
      where: {
        estate_id,
        name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("name")),
          "=",
          name.toLowerCase(),
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Stage name already exists for this estate.");
      error.status = 409;
      throw error;
    }

    // 5. Creation
    const newStage = await EstateStages.create(
      {
        estate_id,
        name,
        release_date: release_date || null,
        attach_file: attach_file || null,
      },
      { transaction },
    );

    await transaction.commit();

    return keysToCamelCase(newStage.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates an estate stage with S3 file management and duplicate checks.
 */
export const updateEstateStageService = async ({ builderId, stageId, data, uploadedFiles = [] }) => {
  const { EstateStages, sequelize } = db;
  const { name, release_date, existing_files, documents_changed } = data;

  // 1. Fetch Existing
  const existingStage = await EstateStages.findByPk(stageId);
  if (!existingStage) {
    const error = new Error("Estate stage not found");
    error.status = 404;
    throw error;
  }

  // 2. Date Validation
  function isValidDate(dateString) {
    if (!dateString) {
      return true;
    }
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  if (release_date && !isValidDate(release_date)) {
    const error = new Error(`Invalid date: ${release_date}`);
    error.status = 400;
    throw error;
  }

  const transaction = await sequelize.transaction();
  try {
    // 3. Duplicate Check
    if (name && name !== existingStage.name) {
      const duplicate = await EstateStages.findOne({
        where: {
          estate_id: existingStage.estate_id,
          name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            "=",
            name.toLowerCase(),
          ),
          estate_stage_id: { [db.Sequelize.Op.ne]: stageId },
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("Stage name already exists for this estate");
        error.status = 400;
        throw error;
      }
    }

    // 4. S3 File Management
    // Attachments are considered modified when new files were uploaded, an
    // explicit kept-list was sent, or the client flagged the change (this last
    // case covers "all documents removed", where nothing else would be sent).
    const existingFiles = existingStage.attach_file || [];
    const documentsModified =
      uploadedFiles.length > 0 ||
      Object.prototype.hasOwnProperty.call(data, "existing_files") ||
      documents_changed === true ||
      documents_changed === "true";

    let updatedFiles = existingFiles;

    if (documentsModified) {
      // Normalize the list of already-uploaded files the client wants to keep.
      let keptFiles = existing_files;
      if (keptFiles === undefined || keptFiles === null || keptFiles === "") {
        keptFiles = [];
      } else if (typeof keptFiles === "string") {
        keptFiles = [keptFiles];
      }

      // Remove any previously-stored file that is no longer kept.
      for (const oldFile of existingFiles) {
        if (!keptFiles.includes(oldFile)) {
          await deleteFromS3(oldFile);
        }
      }

      // Final set = kept existing URLs + newly uploaded file URLs.
      const merged = [...keptFiles, ...uploadedFiles];
      updatedFiles = merged.length > 0 ? merged : null;
    }

    // 5. Execution
    const updateData = {};
    if (name) {
      updateData.name = name;
    }
    if (release_date) {
      updateData.release_date = release_date;
    }
    if (updatedFiles !== existingFiles) {
      updateData.attach_file = updatedFiles;
    }

    if (Object.keys(updateData).length === 0) {
      const error = new Error("Nothing to update");
      error.status = 400;
      throw error;
    }

    await existingStage.update(updateData, { transaction });

    await transaction.commit();

    return keysToCamelCase(existingStage.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * DELETES AN ESTATE STAGE WITH SCOPING AND AUTHORIZATION
 */
export const deleteEstateStageService = async ({ stageId, builderId }) => {
  const { EstateStages, Estate, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // 1. Existence Check
    const stage = await EstateStages.findByPk(stageId, { transaction });

    if (!stage) {
      const error = new Error("Estate stage not found.");
      error.status = 404;
      throw error;
    }

    // 2. Authorization Check
    const estate = await Estate.findOne({
      where: {
        estate_id: stage.estate_id,
        builder_id: builderId,
      },
      transaction,
    });

    if (!estate) {
      const error = new Error("You are not allowed to delete stages from this estate.");
      error.status = 403;
      throw error;
    }

    // 3. Deletion
    await stage.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

export default {
  getAllEstateStagesService,
  createEstateStageService,
  updateEstateStageService,
  deleteEstateStageService,
};
