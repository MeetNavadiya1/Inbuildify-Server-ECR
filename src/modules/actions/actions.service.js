import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

class ActionsService {
  /**
   * Verify if lead belongs to builder/company
   */
  async verifyLeadOwnership(leadsId, builderId, companyId, transaction = null) {
    const { Leads } = db;
    const lead = await Leads.findOne({
      where: {
        leads_id: leadsId,
        [Op.or]: [
          { builder_id: builderId },
          { company_id: companyId ? companyId : { [Op.is]: null } }
        ]
      },
      attributes: ["leads_id"],
      transaction
    });
    return !!lead;
  }

  /**
   * Verify if action belongs to builder/company via lead
   */
  async verifyActionOwnership(actionId, builderId, companyId, transaction = null) {
    const { Actions, Leads } = db;
    const action = await Actions.findOne({
      where: { action_id: actionId },
      include: [
        {
          model: Leads,
          as: "lead",
          required: true,
          where: {
            [Op.or]: [
              { builder_id: builderId },
              { company_id: companyId ? companyId : { [Op.is]: null } }
            ]
          },
          attributes: ["leads_id"]
        }
      ],
      transaction
    });
    return action;
  }

  async createAction(leadsId, actionData, builderId, companyId) {
    const { Actions, Users, Location } = db;
    const transaction = await db.sequelize.transaction();

    try {
      // 1. Verify lead ownership
      const isOwner = await this.verifyLeadOwnership(leadsId, builderId, companyId, transaction);
      if (!isOwner) {
        throw { status: 404, message: "Lead not found" };
      }

      // 2. Validate users_id array
      if (actionData.users_id && actionData.users_id.length > 0) {
        const usersCount = await Users.count({
          where: {
            users_id: { [Op.in]: actionData.users_id },
            builder_id: builderId,
            is_active: true,
            is_deleted: false
          },
          transaction
        });

        if (usersCount !== actionData.users_id.length) {
          // Identify missing IDs for exact error message parity
          const foundUsers = await Users.findAll({
            where: {
              users_id: { [Op.in]: actionData.users_id },
              builder_id: builderId,
              is_active: true,
              is_deleted: false
            },
            attributes: ["users_id"],
            transaction
          });
          const foundIds = foundUsers.map(u => u.users_id);
          const missing = actionData.users_id.filter(id => !foundIds.includes(id));
          throw { status: 400, message: `Invalid users_id: ${missing.join(", ")}` };
        }
      }

      // 3. Validate link_to_user
      if (actionData.link_to_user) {
        const linkUser = await Users.findOne({
          where: {
            users_id: actionData.link_to_user,
            builder_id: builderId,
            is_active: true,
            is_deleted: false
          },
          transaction
        });
        if (!linkUser) {
          throw { status: 400, message: "Invalid link_to_user: User not found" };
        }
      }

      // 4. Validate location_id
      if (actionData.location_id) {
        const location = await Location.findByPk(actionData.location_id, { transaction });
        if (!location) {
          throw { status: 400, message: "Invalid location_id: Location not found" };
        }
      }

      // 5. Create action
      const action = await Actions.create(
        {
          ...actionData,
          leads_id: leadsId
        },
        { transaction }
      );

      await transaction.commit();
      return keysToCamelCase(action.get({ plain: true }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getActions(leadsId, queryParams, builderId, companyId) {
    const { Actions, Location, Users } = db;
    const { action_type, page = 1, limit = 25 } = queryParams;

    const isOwner = await this.verifyLeadOwnership(leadsId, builderId, companyId);
    if (!isOwner) {
      throw { status: 404, message: "Lead not found" };
    }

    const pageValue = parseInt(page, 10);
    const limitValue = parseInt(limit, 10);
    const offset = (pageValue - 1) * limitValue;

    const where = { leads_id: leadsId };
    if (action_type) {
      where.action_type = action_type;
    }

    const { count, rows } = await Actions.findAndCountAll({
      where,
      include: [
        { model: Location, as: "location", attributes: ["name"] },
        { model: Users, as: "linkToUser", attributes: ["name"] }
      ],
      order: [["created_at", "DESC"]],
      limit: limitValue,
      offset: offset,
      distinct: true // Required when using includes with count
    });

    const actions = [];
    for (const row of rows) {
      const plainAction = row.get({ plain: true });
      const action = keysToCamelCase(plainAction);

      // Parity check: raw SQL code joined location_name and link_to_user_name
      action.locationName = plainAction.location?.name || null;
      action.linkToUserName = plainAction.linkToUser?.name || null;
      delete action.location;
      delete action.linkToUser;

      // Resolve users_id names
      if (plainAction.users_id && plainAction.users_id.length > 0) {
        const users = await Users.findAll({
          where: { users_id: { [Op.in]: plainAction.users_id } },
          attributes: ["users_id", "name"]
        });
        action.users = users.map(u => ({
          usersId: u.users_id,
          name: u.name
        }));
      } else {
        action.users = [];
      }
      actions.push(action);
    }

    return {
      actions,
      pagination: {
        page: pageValue,
        limit: limitValue,
        total: count,
        totalPages: Math.ceil(count / limitValue)
      }
    };
  }

  async updateAction(actionId, updateData, builderId, companyId) {
    const { Actions, Users, Location } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const existingAction = await this.verifyActionOwnership(actionId, builderId, companyId, transaction);
      if (!existingAction) {
        throw { status: 404, message: "Action not found or you do not have permission to update it" };
      }

      // Handle file update
      if (updateData.attach_file !== undefined) {
        const oldFile = existingAction.attach_file;
        if (updateData.attach_file === null || (updateData.attach_file && updateData.attach_file !== oldFile)) {
          if (oldFile) {
            try {
              await deleteFromS3(oldFile);
            } catch (s3Error) {
              console.error("Error deleting old attachment from S3:", s3Error);
            }
          }
        }
      }

      // Validations
      if (updateData.users_id && updateData.users_id.length > 0) {
        const usersCount = await Users.count({
          where: {
            users_id: { [Op.in]: updateData.users_id },
            builder_id: builderId,
            is_active: true,
            is_deleted: false
          },
          transaction
        });
        if (usersCount !== updateData.users_id.length) {
          const foundUsers = await Users.findAll({
            where: {
              users_id: { [Op.in]: updateData.users_id },
              builder_id: builderId,
              is_active: true,
              is_deleted: false
            },
            attributes: ["users_id"],
            transaction
          });
          const foundIds = foundUsers.map(u => u.users_id);
          const missing = updateData.users_id.filter(id => !foundIds.includes(id));
          throw { status: 400, message: `Invalid users_id: ${missing.join(", ")}` };
        }
      }

      if (updateData.link_to_user) {
        const linkUser = await Users.findOne({
          where: {
            users_id: updateData.link_to_user,
            builder_id: builderId,
            is_active: true,
            is_deleted: false
          },
          transaction
        });
        if (!linkUser) {
          throw { status: 400, message: "Invalid link_to_user: User not found" };
        }
      }

      if (updateData.location_id) {
        const location = await Location.findByPk(updateData.location_id, { transaction });
        if (!location) {
          throw { status: 400, message: "Invalid location_id: Location not found" };
        }
      }

      await existingAction.update(updateData, { transaction });
      await transaction.commit();

      return keysToCamelCase(existingAction.get({ plain: true }));
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteAction(actionId, builderId, companyId) {
    const { Actions } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const existingAction = await this.verifyActionOwnership(actionId, builderId, companyId, transaction);
      if (!existingAction) {
        throw { status: 404, message: "Action not found or you do not have permission to delete it" };
      }

      if (existingAction.attach_file) {
        try {
          await deleteFromS3(existingAction.attach_file);
        } catch (s3Error) {
          console.error("Error deleting attachment from S3:", s3Error);
        }
      }

      await existingAction.destroy({ transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default new ActionsService();
