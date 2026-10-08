import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  logActivity,
  compareAndLogUpdates,
} from "../../utils/activityLogger.js";

/**
 * Helper to format SMS response to match original raw SQL output.
 */
const formatSmsResponse = (sms) => {
  if (!sms) return null;
  const plainSms = sms.get({ plain: true });
  return keysToCamelCase({
    ...plainSms,
    lead_name: plainSms.lead?.name || null,
    recipient_name: plainSms.recipient?.name || null,
    createdbyname: plainSms.lead?.createdByUser?.name || null,
    // Remove nested objects to match original flat structure
    lead: undefined,
    recipient: undefined,
  });
};

/**
 * Creates a new SMS and logs activity.
 */
export async function createSmsService(data, user) {
  const { Sms, Leads, Users, sequelize } = db;
  const { leads_id, recipient_id, message } = data;
  const { builder_id: builderId, company_id: companyId, users_id: userId } = user;

  const transaction = await sequelize.transaction();

  try {
    // 1. Verify lead ownership
    const leadCheck = await Leads.findOne({
      where: {
        leads_id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!leadCheck) {
      await transaction.rollback();
      return {
        error: { status: 403, message: "Invalid leads_id or access denied." },
      };
    }

    // 2. Verify recipient if provided
    if (recipient_id) {
      const recipientCheck = await Users.findOne({
        where: {
          users_id: recipient_id,
          is_deleted: false,
          is_active: true,
        },
        transaction,
      });

      if (!recipientCheck) {
        await transaction.rollback();
        return {
          error: {
            status: 403,
            message: "Invalid recipient_id or access denied.",
          },
        };
      }
    }

    // 3. Create SMS
    const newSms = await Sms.create(
      {
        leads_id,
        recipient_id: recipient_id || null,
        message,
      },
      { transaction },
    );

    // 4. Fetch enriched data for response and logging
    const enrichedSms = await Sms.findByPk(newSms.sms_id, {
      include: [
        {
          model: Leads,
          as: "lead",
          attributes: ["name", "created_by"],
          include: [
            {
              model: Users,
              as: "createdByUser",
              attributes: ["name"],
            },
          ],
        },
        {
          model: Users,
          as: "recipient",
          attributes: ["name"],
        },
      ],
      transaction,
    });

    const responseData = formatSmsResponse(enrichedSms);

    await transaction.commit();

    // 5. Log Activity (outside transaction as per original logger behavior or using pool)
    await logActivity(null, {
      userId,
      builderId,
      companyId,
      referenceId: leads_id,
      referenceType: "LEAD",
      module: "SMS",
      moduleId: newSms.sms_id,
      recordName: "SMS",
      action: "CREATE",
      description: `SMS sent to ${responseData.recipientName || "customer"}`,
    });

    return { data: responseData };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * Fetches all SMS with filters and pagination.
 */
export async function getAllSmsService(queryParams, user) {
  const { Sms, Leads, Users } = db;
  const { leads_id, recipient_id, page = 1, limit = 25 } = queryParams;
  const { builder_id: builderId, company_id: companyId } = user;

  const pageValue = parseInt(page, 10);
  const limitValue = parseInt(limit, 10);
  const offset = (pageValue - 1) * limitValue;

  const where = {};
  if (leads_id) where.leads_id = leads_id;
  if (recipient_id) where.recipient_id = recipient_id;

  const { count, rows } = await Sms.findAndCountAll({
    where,
    include: [
      {
        model: Leads,
        as: "lead",
        attributes: ["name", "created_by"],
        where: {
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
        required: true, // INNER JOIN as per original SQL
        include: [
          {
            model: Users,
            as: "createdByUser",
            attributes: ["name"],
          },
        ],
      },
      {
        model: Users,
        as: "recipient",
        attributes: ["name"],
        required: false, // LEFT JOIN
      },
    ],
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
    distinct: true, // Important for counts with joins
  });

  return {
    data: {
      sms: rows.map(formatSmsResponse),
      pagination: {
        totalRecords: count,
        totalPages: Math.ceil(count / limitValue),
        currentPage: pageValue,
        limit: limitValue,
      },
    },
  };
}

/**
 * Fetches a single SMS by ID.
 */
export async function getSmsByIdService(smsId, user) {
  const { Sms, Leads, Users } = db;
  const { builder_id: builderId, company_id: companyId } = user;

  const sms = await Sms.findOne({
    where: { sms_id: smsId },
    include: [
      {
        model: Leads,
        as: "lead",
        attributes: ["name", "created_by"],
        where: {
          [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
        },
        required: true,
        include: [
          {
            model: Users,
            as: "createdByUser",
            attributes: ["name"],
          },
        ],
      },
      {
        model: Users,
        as: "recipient",
        attributes: ["name"],
        required: false,
      },
    ],
  });

  if (!sms) {
    return {
      error: { status: 404, message: "SMS not found." },
    };
  }

  return { data: formatSmsResponse(sms) };
}

/**
 * Updates an SMS and logs changes.
 */
export async function updateSmsService(smsId, data, user) {
  const { Sms, Leads, Users, sequelize } = db;
  const { recipient_id, message } = data;
  const { builder_id: builderId, company_id: companyId, users_id: userId } = user;

  const transaction = await sequelize.transaction();

  try {
    const existingSms = await Sms.findOne({
      where: { sms_id: smsId },
      include: [
        {
          model: Leads,
          as: "lead",
          where: {
            [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingSms) {
      await transaction.rollback();
      return {
        error: { status: 404, message: "SMS not found or access denied." },
      };
    }

    const updateData = {};
    if (recipient_id !== undefined) updateData.recipient_id = recipient_id;
    if (message !== undefined) updateData.message = message;

    if (Object.keys(updateData).length === 0) {
      await transaction.rollback();
      return {
        error: { status: 400, message: "No fields to update." },
      };
    }

    const oldData = formatSmsResponse(existingSms);
    await existingSms.update(updateData, { transaction });

    // Re-fetch enriched for response and comparison
    const updatedEnrichedSms = await Sms.findByPk(smsId, {
      include: [
        {
          model: Leads,
          as: "lead",
          attributes: ["name", "created_by"],
          include: [
            {
              model: Users,
              as: "createdByUser",
              attributes: ["name"],
            },
          ],
        },
        {
          model: Users,
          as: "recipient",
          attributes: ["name"],
        },
      ],
      transaction,
    });

    const newData = formatSmsResponse(updatedEnrichedSms);

    await transaction.commit();

    // Log Activity
    await compareAndLogUpdates(null, {
      userId,
      builderId,
      companyId,
      referenceId: existingSms.leads_id,
      referenceType: "LEAD",
      module: "SMS",
      moduleId: smsId,
      recordName: "SMS",
      oldData,
      newData,
    });

    return { data: newData };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}

/**
 * Deletes an SMS and logs activity.
 */
export async function deleteSmsService(smsId, user) {
  const { Sms, Leads, sequelize } = db;
  const { builder_id: builderId, company_id: companyId, users_id: userId } = user;

  const transaction = await sequelize.transaction();

  try {
    const existingSms = await Sms.findOne({
      where: { sms_id: smsId },
      include: [
        {
          model: Leads,
          as: "lead",
          where: {
            [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
          },
          required: true,
        },
      ],
      transaction,
    });

    if (!existingSms) {
      await transaction.rollback();
      return {
        error: { status: 404, message: "SMS not found or access denied." },
      };
    }

    const leadsId = existingSms.leads_id;
    await existingSms.destroy({ transaction });

    await transaction.commit();

    // Log Activity
    await logActivity(null, {
      userId,
      builderId,
      companyId,
      referenceId: leadsId,
      referenceType: "LEAD",
      module: "SMS",
      moduleId: smsId,
      recordName: "SMS",
      action: "DELETE",
      description: "SMS deleted",
    });

    return { success: true };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
}
