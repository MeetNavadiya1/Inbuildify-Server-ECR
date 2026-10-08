import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

/**
 * Fetches or creates job commission settings for an organization.
 */
export const getUserJobCommissionSettingsService = async (userContext) => {
  const { JobCommissionSettings } = db;
  const { companyId, builderId, userId } = userContext;

  return await db.sequelize.transaction(async (transaction) => {
    const [settings, created] = await JobCommissionSettings.findOrCreate({
      where: { company_id: companyId, builder_id: builderId },
      defaults: {
        company_id: companyId,
        builder_id: builderId,
        created_by: userId,
        updated_by: userId,
      },
      transaction,
    });

    return {
      define_outgoing_commission: settings.define_outgoing_commission,
      define_incoming_commission: settings.define_incoming_commission,
    };
  });
};

/**
 * Updates job commission settings.
 */
export const updateJobCommissionSettingsService = async (data, userContext) => {
  const { JobCommissionSettings } = db;
  const { builderId, companyId, userId } = userContext;
  const { define_outgoing_commission, define_incoming_commission } = data;

  return await db.sequelize.transaction(async (transaction) => {
    const settings = await JobCommissionSettings.findOne({
      where: {
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
      transaction,
    });

    if (!settings) {
      throw { status: 404, message: "No commission setting found for this user." };
    }

    const updateBody = {
      updated_by: userId,
      updated_at: new Date(),
    };

    if (define_outgoing_commission !== undefined) updateBody.define_outgoing_commission = define_outgoing_commission;
    if (define_incoming_commission !== undefined) updateBody.define_incoming_commission = define_incoming_commission;

    await settings.update(updateBody, { transaction });

    return {
      define_outgoing_commission: settings.define_outgoing_commission,
      define_incoming_commission: settings.define_incoming_commission,
    };
  });
};

export default {
  getUserJobCommissionSettingsService,
  updateJobCommissionSettingsService,
};
