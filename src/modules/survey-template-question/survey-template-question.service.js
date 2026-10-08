import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

// ============================================================
//        SURVEY TEMPLATE QUESTION CRUD OPERATIONS
// ============================================================

export async function createSurveyTemplateQuestion(currentUser, payload) {
  const { SurveyTemplateQuestions, SurveyTemplate } = db;
  const builderId = currentUser.builder_id;
  const userId = currentUser.users_id;

  const { survey_template_id, description, option_type, options, sort_order, is_required = true } = payload;

  const allowedTypes = ["text", "radio", "star_1_to_5", "star_1_to_10"];
  if (!allowedTypes.includes(option_type)) {
    throw { status: 400, message: "Invalid option_type." };
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Template validation
    const template = await SurveyTemplate.findOne({
      where: { survey_template_id, builder_id: builderId, status: true },
      transaction
    });

    if (!template) {
      throw { status: 403, message: "Survey template is invalid or inactive." };
    }

    // 2. Sort order logic
    const maxSortOrder = await SurveyTemplateQuestions.max('sort_order', { where: { survey_template_id }, transaction }) || 0;
    let finalSortOrder;

    if (sort_order === undefined || sort_order === null) {
      finalSortOrder = maxSortOrder + 1;
    } else {
      if (sort_order < 1 || sort_order > maxSortOrder + 1) {
        throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.` };
      }
      finalSortOrder = sort_order;

      await SurveyTemplateQuestions.update(
        { sort_order: db.sequelize.literal('sort_order + 1') },
        { where: { survey_template_id, sort_order: { [Op.gte]: finalSortOrder } }, transaction }
      );
    }

    // 3. Create question
    const newQuestion = await SurveyTemplateQuestions.create({
      survey_template_id,
      description,
      option_type,
      options: option_type === "radio" ? options : null,
      is_required,
      sort_order: finalSortOrder,
      created_by: userId,
      updated_by: userId
    }, { transaction });

    await transaction.commit();

    const plain = newQuestion.get({ plain: true });
    return {
      surveyQuestionId: plain.survey_question_id,
      description: plain.description,
      optionType: plain.option_type,
      options: plain.options,
      isRequired: plain.is_required,
      sortOrder: plain.sort_order,
      surveyTemplate: {
        id: template.survey_template_id,
        name: template.name,
      },
      createdBy: plain.created_by,
      updatedBy: plain.updated_by,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getAllSurveyTemplateQuestions(currentUser, query = {}) {
  const { SurveyTemplateQuestions, SurveyTemplate } = db;
  const builderId = currentUser.builder_id;
  const { page = 1, limit = 25, survey_template_id } = query;

  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const where = {};
  if (survey_template_id) {
    where.survey_template_id = survey_template_id;
  }

  const { rows, count } = await SurveyTemplateQuestions.findAndCountAll({
    where,
    include: [{
      model: SurveyTemplate,
      as: "surveyTemplate",
      required: true,
      attributes: ["survey_template_id", "name"],
      where: { builder_id: builderId }
    }],
    order: [["sort_order", "ASC"]],
    limit: limitValue,
    offset,
    distinct: true
  });

  const formattedRows = rows.map(r => {
    const plain = r.get({ plain: true });
    return {
      surveyQuestionId: plain.survey_question_id,
      description: plain.description,
      optionType: plain.option_type,
      options: plain.options,
      isRequired: plain.is_required,
      sortOrder: plain.sort_order,
      surveyTemplate: {
        id: plain.surveyTemplate.survey_template_id,
        name: plain.surveyTemplate.name
      },
      createdBy: plain.created_by,
      updatedBy: plain.updated_by,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  });

  return {
    questions: keysToCamelCase(formattedRows),
    pagination: {
      totalRecords: count,
      currentPage: pageValue,
      totalPages: Math.ceil(count / limitValue),
      limit: limitValue,
    },
  };
}

export async function deleteSurveyTemplateQuestion(currentUser, survey_question_id) {
  const { SurveyTemplateQuestions, SurveyTemplate } = db;
  const builderId = currentUser.builder_id;

  const transaction = await db.sequelize.transaction();

  try {
    const question = await SurveyTemplateQuestions.findOne({
      where: { survey_question_id },
      include: [{
        model: SurveyTemplate,
        as: "surveyTemplate",
        required: true,
        where: { builder_id: builderId }
      }],
      transaction
    });

    if (!question) {
      throw { status: 404, message: "Survey template question not found or not owned by this builder." };
    }

    const deletedSortOrder = question.sort_order;
    const surveyTemplateId = question.survey_template_id;

    await SurveyTemplateQuestions.update(
      { sort_order: db.sequelize.literal('sort_order - 1') },
      { where: { survey_template_id: surveyTemplateId, sort_order: { [Op.gt]: deletedSortOrder } }, transaction }
    );

    await question.destroy({ transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateSurveyTemplateQuestion(currentUser, survey_question_id, payload) {
  const { SurveyTemplateQuestions, SurveyTemplate } = db;
  const builderId = currentUser.builder_id;
  const { description, option_type, options, sort_order, is_required } = payload;

  const transaction = await db.sequelize.transaction();

  try {
    const question = await SurveyTemplateQuestions.findOne({
      where: { survey_question_id },
      include: [{
        model: SurveyTemplate,
        as: "surveyTemplate",
        required: true,
        where: { builder_id: builderId }
      }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!question) {
      throw { status: 404, message: "Survey template question not found or not owned by this builder." };
    }

    const surveyTemplateId = question.survey_template_id;
    const currentSortOrder = question.sort_order;

    // 1. Sort order rebalancing
    if (sort_order !== undefined && sort_order !== currentSortOrder) {
      const maxSortOrder = await SurveyTemplateQuestions.max('sort_order', { where: { survey_template_id: surveyTemplateId }, transaction });

      if (sort_order < 1 || sort_order > maxSortOrder) {
        throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.` };
      }

      if (sort_order < currentSortOrder) {
        await SurveyTemplateQuestions.update(
          { sort_order: db.sequelize.literal('sort_order + 1') },
          { 
            where: { 
              survey_template_id: surveyTemplateId, 
              sort_order: { [Op.gte]: sort_order, [Op.lt]: currentSortOrder },
              survey_question_id: { [Op.ne]: survey_question_id }
            }, 
            transaction 
          }
        );
      } else {
        await SurveyTemplateQuestions.update(
          { sort_order: db.sequelize.literal('sort_order - 1') },
          { 
            where: { 
              survey_template_id: surveyTemplateId, 
              sort_order: { [Op.gt]: currentSortOrder, [Op.lte]: sort_order },
              survey_question_id: { [Op.ne]: survey_question_id }
            }, 
            transaction 
          }
        );
      }
    }

    // 2. Type validation and transitions
    const updateData = {};
    if (description !== undefined) updateData.description = description;
    if (is_required !== undefined) updateData.is_required = is_required;

    let finalOptionType = question.option_type;
    if (option_type !== undefined) {
      const validTypes = ["text", "radio", "star_1_to_5", "star_1_to_10"];
      if (!validTypes.includes(option_type)) {
        throw { status: 400, message: `Invalid option_type. Must be one of: ${validTypes.join(", ")}` };
      }
      updateData.option_type = option_type;
      finalOptionType = option_type;

      if (option_type !== "radio") {
        updateData.options = null;
      }
    }

    if (options !== undefined) {
      if (finalOptionType !== "radio") {
        throw { status: 400, message: "Options can only be updated when option_type is radio." };
      }
      if (!Array.isArray(options)) {
        throw { status: 400, message: "Options must be an array of strings." };
      }
      updateData.options = options;
    }

    if (sort_order !== undefined) updateData.sort_order = sort_order;

    if (Object.keys(updateData).length === 0) {
      throw { status: 400, message: "No fields provided to update." };
    }

    await question.update(updateData, { transaction });

    await transaction.commit();

    const plain = question.get({ plain: true });
    return {
      surveyQuestionId: plain.survey_question_id,
      description: plain.description,
      optionType: plain.option_type,
      options: plain.options,
      isRequired: plain.is_required,
      sortOrder: plain.sort_order,
      surveyTemplate: {
        id: plain.surveyTemplate.survey_template_id,
        name: plain.surveyTemplate.name
      },
      createdBy: plain.created_by,
      updatedBy: plain.updated_by,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default {
  createSurveyTemplateQuestion,
  getAllSurveyTemplateQuestions,
  deleteSurveyTemplateQuestion,
  updateSurveyTemplateQuestion
};
