import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches survey templates with dynamic filtering and pagination.
 */
export const getAllSurveyTemplatesService = async ({ builderId, query }) => {
  const { SurveyTemplate, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    page = 1,
    limit = 25,
    name,
    sort_order,
    status,
  } = query;

  const limitValue = parseInt(limit, 10) || 25;
  const pageValue = parseInt(page, 10) || 1;
  const offset = (pageValue - 1) * limitValue;

  // Build Where Clause
  const where = {
    builder_id: builderId,
  };

  if (name !== undefined && name.trim() !== "") {
    where.name = { [Op.iLike]: `%${name.trim()}%` };
  }

  if (status !== undefined) {
    where.status = typeof status === "boolean" ? status : status === "true";
  }

  if (sort_order !== undefined) {
    const sortValue = parseInt(sort_order, 10);
    if (!isNaN(sortValue)) {
      where.sort_order = sortValue;
    }
  }

  const { count: totalRecords, rows: surveyTemplates } = await SurveyTemplate.findAndCountAll({
    where,
    limit: limitValue,
    offset,
    order: [["sort_order", "ASC"]],
  });

  const totalPages = Math.ceil(totalRecords / limitValue);

  return {
    surveyTemplates: keysToCamelCase(surveyTemplates.map((st) => st.toJSON())),
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords,
      limit: limitValue,
    },
  };
};

/**
 * Creates a new survey template with duplicate check and sort order management.
 */
export const createSurveyTemplateService = async ({ builderId, companyId, userId, data }) => {
  const { SurveyTemplate, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  if (!builderId || !companyId) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }

  const {
    name,
    sort_order,
    is_recommended = false,
    status = true,
  } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Duplicate check
    const duplicate = await SurveyTemplate.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        is_sample_data: false,
        name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("name")),
          sequelize.fn("LOWER", name),
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Survey template with this name already exists.");
      error.status = 409;
      throw error;
    }

    // 2. Sort order management
    const maxSortOrderItem = await SurveyTemplate.findOne({
      attributes: [[sequelize.fn("MAX", sequelize.col("sort_order")), "max_sort_order"]],
      where: { company_id: companyId, builder_id: builderId },
      transaction,
      raw: true,
    });

    const maxSortOrder = parseInt(maxSortOrderItem?.max_sort_order || 0, 10);
    const finalSortOrder = maxSortOrder + 1;

    // 3. Recommendation logic
    if (is_recommended === true) {
      await SurveyTemplate.update(
        { is_recommended: false },
        {
          where: { company_id: companyId, builder_id: builderId },
          transaction,
        },
      );
    }

    // 4. Create
    const created = await SurveyTemplate.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name,
        sort_order: finalSortOrder,
        is_recommended,
        status,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(created.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Updates a survey template with dependency validation and sort order shifting.
 */
export const updateSurveyTemplateService = async ({
  surveyTemplateId,
  builderId,
  companyId,
  userId,
  data,
}) => {
  const { SurveyTemplate, sequelize, Sequelize } = db;
  const { Op } = Sequelize;

  if (!surveyTemplateId) {
    const error = new Error("survey_template_id is required.");
    error.status = 400;
    throw error;
  }

  const { name, sort_order, is_recommended, status } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Fetch and Lock existing
    const existing = await SurveyTemplate.findOne({
      where: {
        survey_template_id: surveyTemplateId,
        builder_id: builderId,
        company_id: companyId,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!existing) {
      const error = new Error(
        "Record not found or you are not allowed to update this record.",
      );
      error.status = 404;
      throw error;
    }

    const oldTemplate = existing.toJSON();

    // 2. Validations
    if (status !== undefined && typeof status !== "boolean") {
      const error = new Error(
        "The 'status' field must be a boolean (true or false).",
      );
      error.status = 400;
      throw error;
    }

    if (name) {
      const duplicate = await SurveyTemplate.findOne({
        where: {
          name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            sequelize.fn("LOWER", name),
          ),
          company_id: companyId,
          builder_id: builderId,
          is_sample_data: false,
          survey_template_id: { [Op.ne]: surveyTemplateId },
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error(
          "Survey template name already exists for this builder.",
        );
        error.status = 400;
        throw error;
      }
    }

    // 3. Sort Order Management
    if (sort_order !== undefined) {
      const maxSort =
        (await SurveyTemplate.max("sort_order", {
          where: { company_id: companyId, builder_id: builderId },
          transaction,
        })) || 0;

      if (sort_order < 1 || sort_order > maxSort) {
        const error = new Error(`sort_order must be between 1 and ${maxSort}`);
        error.status = 400;
        throw error;
      }

      const oldSortOrder = oldTemplate.sort_order;
      if (sort_order !== oldSortOrder) {
        if (sort_order < oldSortOrder) {
          // Shifting up
          await SurveyTemplate.update(
            { sort_order: sequelize.literal("sort_order + 1") },
            {
              where: {
                sort_order: { [Op.gte]: sort_order, [Op.lt]: oldSortOrder },
                company_id: companyId,
                builder_id: builderId,
                survey_template_id: { [Op.ne]: surveyTemplateId },
              },
              transaction,
            },
          );
        } else {
          // Shifting down
          await SurveyTemplate.update(
            { sort_order: sequelize.literal("sort_order - 1") },
            {
              where: {
                sort_order: { [Op.gt]: oldSortOrder, [Op.lte]: sort_order },
                company_id: companyId,
                builder_id: builderId,
                survey_template_id: { [Op.ne]: surveyTemplateId },
              },
              transaction,
            },
          );
        }
      }
    }

    // 4. Recommendation Logic
    if (is_recommended === true) {
      await SurveyTemplate.update(
        { is_recommended: false },
        {
          where: {
            company_id: companyId,
            builder_id: builderId,
            is_recommended: true,
            survey_template_id: { [Op.ne]: surveyTemplateId },
          },
          transaction,
        },
      );
    }

    // 5. Update Record
    const updateData = {
      updated_by: userId,
    };

    if (name !== undefined) {
      updateData.name = name;
    }
    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }
    if (is_recommended !== undefined) {
      updateData.is_recommended = is_recommended;
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    await existing.update(updateData, { transaction });

    await transaction.commit();
    return keysToCamelCase(existing.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

export default {
  getAllSurveyTemplatesService,
  createSurveyTemplateService,
  updateSurveyTemplateService,
};
