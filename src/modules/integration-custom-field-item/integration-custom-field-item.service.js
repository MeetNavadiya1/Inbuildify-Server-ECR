import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";


/**
 * Transforms the Sequelize instance to the required API response format.
 */
const formatItemResponse = (item) => {
  const plainItem = item.get({ plain: true });
  return {
    ...plainItem,
    assigneeUser: plainItem.assigneeUser
      ? {
          id: plainItem.assigneeUser.users_id,
          name: plainItem.assigneeUser.name,
        }
      : null,
  };
};

/**
 * Creates a new integration custom field item.
 */
export const createItemService = async (data, userContext) => {
  const { IntegrationCustomFieldItem, IntegrationCustomFieldHeader, Users } = db;
  const { builderId, companyId, userId } = userContext;
  const { header1_id, header2_id, value1, value2, assignee_user_id } = data;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: Missing builder or company ID." };
  }

  if (!header1_id) {
    throw { status: 400, message: "header1_id is required." };
  }

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Validate Header 1
    const header1 = await IntegrationCustomFieldHeader.findOne({
      where: {
        integration_custom_field_header_id: header1_id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!header1) {
      throw { status: 400, message: "Invalid header1_id: not owned by this builder/company." };
    }

    // 2. Validate Header 2
    if (header2_id) {
      const header2 = await IntegrationCustomFieldHeader.findOne({
        where: {
          integration_custom_field_header_id: header2_id,
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
        transaction,
      });

      if (!header2) {
        throw { status: 400, message: "Invalid header2_id: not owned by this builder/company." };
      }
    }

    // 3. Validate Assignee User
    if (assignee_user_id) {
      const user = await Users.findOne({
        where: { users_id: assignee_user_id, is_deleted: false },
        transaction,
      });

      if (!user) {
        throw { status: 400, message: "Invalid assignee_user_id: user not found." };
      }
    }

    // 4. Create Item
    const newItem = await IntegrationCustomFieldItem.create(
      {
        company_id: companyId,
        builder_id: builderId,
        header1_id,
        header2_id,
        value1: value1 || null,
        value2: value2 || null,
        assignee_user_id: assignee_user_id || null,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    // 5. Fetch enriched data
    const enrichedItem = await IntegrationCustomFieldItem.findByPk(newItem.integration_custom_field_item_id, {
      include: [
        {
          model: Users,
          as: "assigneeUser",
          attributes: ["users_id", "name"],
        },
      ],
      transaction,
    });

    return formatItemResponse(enrichedItem);
  });
};

/**
 * Retrieves all integration custom field items for a builder.
 */
export const getAllItemsService = async (queryParams, userContext) => {
  const { IntegrationCustomFieldItem, Users } = db;
  const { builderId } = userContext;
  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const { page = 1, limit = 25 } = queryParams;
  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await IntegrationCustomFieldItem.findAndCountAll({
    where: { builder_id: builderId },
    include: [
      {
        model: Users,
        as: "assigneeUser",
        attributes: ["users_id", "name"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
  });

  const totalPages = Math.ceil(count / limitValue);

  return {
    items: rows.map(formatItemResponse),
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
};

/**
 * Updates an integration custom field item.
 */
export const updateItemService = async (id, data, userContext) => {
  const { IntegrationCustomFieldItem, IntegrationCustomFieldHeader, Users } = db;
  const { builderId, companyId, userId } = userContext;
  const { header1_id, header2_id, value1, value2, assignee_user_id } = data;

  if (!builderId && !companyId) {
    throw { status: 401, message: "Unauthorized: Missing builder or company ID." };
  }

  return await db.sequelize.transaction(async (transaction) => {
    // 1. Check existence and ownership
    const existingItem = await IntegrationCustomFieldItem.findOne({
      where: {
        integration_custom_field_item_id: id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!existingItem) {
      throw { status: 404, message: "No integration custom field item found for this user." };
    }

    // 2. Validate Header 1
    if (header1_id) {
      const header1 = await IntegrationCustomFieldHeader.findOne({
        where: {
          integration_custom_field_header_id: header1_id,
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
        transaction,
      });
      if (!header1) {
        throw { status: 400, message: "Invalid header1_id. It does not belong to this builder or company." };
      }
    }

    // 3. Validate Header 2
    if (header2_id) {
      const header2 = await IntegrationCustomFieldHeader.findOne({
        where: {
          integration_custom_field_header_id: header2_id,
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
        transaction,
      });
      if (!header2) {
        throw { status: 400, message: "Invalid header2_id. It does not belong to this builder or company." };
      }
    }

    // 4. Validate Assignee User
    if (assignee_user_id) {
      const user = await Users.findOne({
        where: { users_id: assignee_user_id, is_deleted: false },
        transaction,
      });
      if (!user) {
        throw { status: 400, message: "Invalid assignee_user_id." };
      }
    }

    // 5. Update
    const updateBody = {
      updated_by: userId,
    };
    if (header1_id !== undefined) updateBody.header1_id = header1_id;
    if (header2_id !== undefined) updateBody.header2_id = header2_id;
    if (value1 !== undefined) updateBody.value1 = value1;
    if (value2 !== undefined) updateBody.value2 = value2;
    if (assignee_user_id !== undefined) updateBody.assignee_user_id = assignee_user_id;

    await existingItem.update(updateBody, { transaction });

    // 6. Fetch enriched data
    const enrichedItem = await IntegrationCustomFieldItem.findByPk(id, {
      include: [
        {
          model: Users,
          as: "assigneeUser",
          attributes: ["users_id", "name"],
        },
      ],
      transaction,
    });

    return formatItemResponse(enrichedItem);
  });
};

/**
 * Deletes an integration custom field item.
 */
export const deleteItemService = async (id, userContext) => {
  const { IntegrationCustomFieldItem } = db;
  const { builderId } = userContext;
  if (!builderId) {
    throw { status: 401, message: "Unauthorized: Missing builder ID." };
  }

  const deletedCount = await IntegrationCustomFieldItem.destroy({
    where: {
      integration_custom_field_item_id: id,
      builder_id: builderId,
    },
  });

  if (deletedCount === 0) {
    throw { status: 404, message: "No integration custom field item found for this builder." };
  }

  return true;
};

export default {
  createItemService,
  getAllItemsService,
  updateItemService,
  deleteItemService,
};
