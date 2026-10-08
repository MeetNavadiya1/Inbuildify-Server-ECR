import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default construction_ets_recharge for a new builder
 */
export async function seedConstructionEtsRecharge({ company_id, builder_id, created_by, transaction }) {
  const { ConstructionEtsRecharge } = db;

  await ConstructionEtsRecharge.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      enable_ets_supplier: false,
      enable_recharge_supplier: true,
      signature_section: true,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedConstructionEtsRecharge };
