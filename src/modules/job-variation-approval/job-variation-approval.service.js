import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * FETCH ALL JOB VARIATION APPROVALS WITH SCOPING
 */
export const getAllVariationApprovalsService = async ({ builderId, companyId }) => {
  const { JobVariationApproval, Role, Sequelize } = db;
  const { Op } = Sequelize;

  const results = await JobVariationApproval.findAll({
    where: {
      [Op.or]: [
        { company_id: companyId },
        { builder_id: builderId },
      ],
    },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["role_id", "name"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return results.map((row) => {
    const plain = row.toJSON();
    return {
      job_variation_approval_id: plain.job_variation_approval_id,
      company_id: plain.company_id,
      builder_id: plain.builder_id,
      amount: plain.amount,
      role: plain.role
        ? {
          id: plain.role.role_id,
          name: plain.role.name,
        }
        : null,
      created_by: plain.created_by,
      updated_by: plain.updated_by,
      created_at: plain.createdAt,
      updated_at: plain.updatedAt,
    };
  });
};

/**
 * CREATE A JOB VARIATION APPROVAL
 */
export const createVariationApprovalService = async ({ builderId, companyId, userId, data }) => {
  const { JobVariationApproval, Role, Sequelize, sequelize } = db;
  const { Op } = Sequelize;
  const { role_id, amount } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Role Existence Check
    const role = await Role.findByPk(role_id, { transaction });
    if (!role) {
      const error = new Error("Role not found or unauthorized.");
      error.status = 404;
      throw error;
    }

    // 2. Duplicate Check
    const duplicate = await JobVariationApproval.findOne({
      where: {
        role_id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Approval for this role already exists.");
      error.status = 409;
      throw error;
    }

    // 3. Insertion
    const newApproval = await JobVariationApproval.create(
      {
        company_id: companyId,
        builder_id: builderId,
        role_id,
        amount,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    // 4. Fetch with role details for response parity
    return {
      ...keysToCamelCase(newApproval.toJSON()),
      role: {
        id: role.role_id,
        name: role.name,
      },
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * UPDATE A JOB VARIATION APPROVAL
 */
export const updateVariationApprovalService = async ({ id, builderId, companyId, userId, data }) => {
  const { JobVariationApproval, Role, Sequelize, sequelize } = db;
  const { Op } = Sequelize;
  const { role_id, amount } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Existence and Scoping Check
    const existing = await JobVariationApproval.findOne({
      where: {
        job_variation_approval_id: id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("Job variation approval not found or unauthorized to update.");
      error.status = 404;
      throw error;
    }

    // 2. Role Validation & Duplicate Check if role_id changes
    if (role_id && role_id !== existing.role_id) {
      const role = await Role.findByPk(role_id, { transaction });
      if (!role) {
        const error = new Error("Role not found or unauthorized.");
        error.status = 404;
        throw error;
      }

      const duplicate = await JobVariationApproval.findOne({
        where: {
          role_id,
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
          job_variation_approval_id: { [Op.ne]: id },
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("Approval for this role already exists.");
        error.status = 409;
        throw error;
      }
    }

    // 3. Perform Update
    const updateData = { updated_by: userId };
    if (role_id !== undefined) updateData.role_id = role_id;
    if (amount !== undefined) updateData.amount = amount;

    await existing.update(updateData, { transaction });

    // 4. Final Fetch for Role details
    const updated = await JobVariationApproval.findByPk(id, {
      include: [{ model: Role, as: "role", attributes: ["role_id", "name"] }],
      transaction,
    });

    await transaction.commit();

    const plain = updated.toJSON();
    return {
      ...keysToCamelCase(plain),
      role: plain.role
        ? {
          id: plain.role.role_id,
          name: plain.role.name,
        }
        : null,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * DELETE A JOB VARIATION APPROVAL
 */
export const deleteVariationApprovalService = async ({ id, builderId, companyId }) => {
  const { JobVariationApproval, Sequelize, sequelize } = db;
  const { Op } = Sequelize;

  const transaction = await sequelize.transaction();
  try {
    const existing = await JobVariationApproval.findOne({
      where: {
        job_variation_approval_id: id,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!existing) {
      const error = new Error("Job variation approval not found or unauthorized to delete.");
      error.status = 404;
      throw error;
    }

    await existing.destroy({ transaction });
    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

export default {
  getAllVariationApprovalsService,
  createVariationApprovalService,
  updateVariationApprovalService,
  deleteVariationApprovalService,
};
