import db from "../../config/database/models/postgre-models/index.js";

/* -----------------------------
   GET Settings
------------------------------ */
export async function getEtsRechargeSettingsService(user) {
  const { company_id, builder_id, users_id } = user;

  const whereClause = {
    company_id: company_id || null,
    builder_id: builder_id || null,
  };

  const existing = await db.ConstructionEtsRecharge.findOne({
    where: whereClause,
    attributes: ["enable_ets_supplier", "enable_recharge_supplier", "signature_section"],
  });

  if (!existing) {
    const inserted = await db.ConstructionEtsRecharge.create({
      company_id: company_id || null,
      builder_id: builder_id || null,
      created_by: users_id,
      updated_by: users_id,
    });

    return {
      enable_ets_supplier: inserted.enable_ets_supplier,
      enable_recharge_supplier: inserted.enable_recharge_supplier,
      signature_section: inserted.signature_section,
    };
  }

  return existing.toJSON();
}

/* -----------------------------
   UPDATE Settings
------------------------------ */
export async function updateEtsRechargeSettingsService(user, payload) {
  const { company_id, builder_id } = user;
  const userId = user.users_id || user.user_id;

  const whereClause = {
    company_id: company_id || null,
    builder_id: builder_id || null,
  };

  const existing = await db.ConstructionEtsRecharge.findOne({
    where: whereClause,
  });

  const { enable_ets_supplier, enable_recharge_supplier, signature_section } = payload;

  if (!existing) {
    const createPayload = {
      company_id: company_id || null,
      builder_id: builder_id || null,
      created_by: userId,
      updated_by: userId,
    };
    if (enable_ets_supplier !== undefined && enable_ets_supplier !== null) {
      createPayload.enable_ets_supplier = enable_ets_supplier;
    }
    if (enable_recharge_supplier !== undefined && enable_recharge_supplier !== null) {
      createPayload.enable_recharge_supplier = enable_recharge_supplier;
    }
    if (signature_section !== undefined && signature_section !== null) {
      createPayload.signature_section = signature_section;
    }

    const inserted = await db.ConstructionEtsRecharge.create(createPayload);

    return {
      enable_ets_supplier: inserted.enable_ets_supplier,
      enable_recharge_supplier: inserted.enable_recharge_supplier,
      signature_section: inserted.signature_section,
    };
  }

  const updatePayload = { updated_by: userId };
  if (enable_ets_supplier !== undefined && enable_ets_supplier !== null) {
    updatePayload.enable_ets_supplier = enable_ets_supplier;
  }
  if (enable_recharge_supplier !== undefined && enable_recharge_supplier !== null) {
    updatePayload.enable_recharge_supplier = enable_recharge_supplier;
  }
  if (signature_section !== undefined && signature_section !== null) {
    updatePayload.signature_section = signature_section;
  }

  await existing.update(updatePayload);

  return {
    enable_ets_supplier: existing.enable_ets_supplier,
    enable_recharge_supplier: existing.enable_recharge_supplier,
    signature_section: existing.signature_section,
  };
}
