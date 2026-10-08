import db from "../../config/database/models/postgre-models/index.js";

/* ---------------------------------
   CREATE APPROVAL
---------------------------------- */
export async function createEtsRechargeApprovalService(user, payload) {
  const { user_id, users_id, company_id, builder_id } = user;
  const { role_id, amount } = payload;

  const creatorId = users_id || user_id;

  if (!role_id || amount === undefined) {
    throw new Error("Missing required fields: role_id, amount");
  }

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const orConditions = [];
  if (company_id) {
    orConditions.push({ company_id });
  }
  if (builder_id) {
    orConditions.push({ builder_id });
  }
  const orClause = orConditions.length > 0 ? { [db.Sequelize.Op.or]: orConditions } : { construction_ets_recharge_id: null };

  const etsRecharge = await db.ConstructionEtsRecharge.findOne({
    where: orClause,
    attributes: ["construction_ets_recharge_id"],
  });

  if (!etsRecharge) {
    throw new Error("No construction ETS recharge record found for this user. Please create a construction ETS recharge record first.");
  }

  const construction_ets_recharge_id = etsRecharge.construction_ets_recharge_id;

  const roleCheck = await db.Role.findOne({
    where: { role_id },
    attributes: ["role_id"],
  });

  if (!roleCheck) {
    throw new Error("Invalid role_id");
  }

  const duplicateRoleCheck = await db.ConstructionEtsRechargeApproval.findOne({
    where: {
      construction_ets_recharge_id,
      role_id,
    },
    attributes: ["construction_ets_recharge_approval_id"],
  });

  if (duplicateRoleCheck) {
    throw new Error("This role has already been added for approval. Duplicate role is not allowed.");
  }

  const inserted = await db.ConstructionEtsRechargeApproval.create({
    construction_ets_recharge_id,
    role_id,
    amount,
    created_by: creatorId,
    updated_by: creatorId,
  });

  const fullRecord = await db.ConstructionEtsRechargeApproval.findOne({
    where: { construction_ets_recharge_approval_id: inserted.construction_ets_recharge_approval_id },
    include: [
      {
        model: db.Role,
        as: "role",
        attributes: ["name"],
      },
    ],
  });

  const resultData = fullRecord.toJSON();
  resultData.role_name = resultData.role?.name || null;
  delete resultData.role;

  return resultData;
}

/* ---------------------------------
   GET ALL
---------------------------------- */
export async function getAllEtsRechargeApprovalsService(queryParams) {
  const { construction_ets_recharge_id, role_id } = queryParams;

  const whereClause = {};
  if (construction_ets_recharge_id) {
    whereClause.construction_ets_recharge_id = construction_ets_recharge_id;
  }
  if (role_id) {
    whereClause.role_id = role_id;
  }

  const records = await db.ConstructionEtsRechargeApproval.findAll({
    where: whereClause,
    include: [
      { model: db.Role, as: "role", attributes: ["name"] },
      { model: db.Users, as: "createdByUser", attributes: ["name"] },
    ],
    order: [["created_at", "DESC"]],
  });

  return records.map(record => {
    const json = record.toJSON();
    json.role_name = json.role?.name || null;
    json.created_by_name = json.createdByUser?.name || null;
    delete json.role;
    delete json.createdByUser;
    return json;
  });
}

/* ---------------------------------
   GET BY ID
---------------------------------- */
export async function getEtsRechargeApprovalByIdService(id) {
  if (!id) {
    throw new Error("construction_ets_recharge_approval_id is required.");
  }

  const record = await db.ConstructionEtsRechargeApproval.findOne({
    where: { construction_ets_recharge_approval_id: id },
    include: [
      { model: db.Role, as: "role", attributes: ["name"] },
      { model: db.Users, as: "createdByUser", attributes: ["name"] },
    ],
  });

  if (!record) {
    throw new Error("Construction ETS recharge approval not found.");
  }

  const json = record.toJSON();
  json.role_name = json.role?.name || null;
  json.created_by_name = json.createdByUser?.name || null;
  delete json.role;
  delete json.createdByUser;

  return json;
}

/* ---------------------------------
   UPDATE
---------------------------------- */
export async function updateEtsRechargeApprovalService(user, id, payload) {
  const { role_id, amount } = payload;
  const creatorId = user.users_id || user.user_id;

  if (!id) {
    throw new Error("construction_ets_recharge_approval_id is required.");
  }

  if (!role_id && amount === undefined) {
    throw new Error("At least one field (role_id or amount) is required for update.");
  }

  const existing = await db.ConstructionEtsRechargeApproval.findOne({
    where: { construction_ets_recharge_approval_id: id },
  });

  if (!existing) {
    throw new Error("Construction ETS recharge approval not found.");
  }

  if (role_id && role_id !== existing.role_id) {
    const duplicateRoleCheck = await db.ConstructionEtsRechargeApproval.findOne({
      where: {
        construction_ets_recharge_id: existing.construction_ets_recharge_id,
        role_id,
        construction_ets_recharge_approval_id: { [db.Sequelize.Op.ne]: id },
      },
    });

    if (duplicateRoleCheck) {
      throw new Error("This role has already been added for approval. Duplicate role is not allowed.");
    }
  }

  const updatePayload = { updated_by: creatorId };
  if (role_id) {
    updatePayload.role_id = role_id;
  }
  if (amount !== undefined) {
    if (amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }
    updatePayload.amount = amount;
  }

  await existing.update(updatePayload);

  return getEtsRechargeApprovalByIdService(id);
}

/* ---------------------------------
   DELETE
---------------------------------- */
export async function deleteEtsRechargeApprovalService(id) {
  if (!id) {
    throw new Error("construction_ets_recharge_approval_id is required.");
  }

  const existing = await db.ConstructionEtsRechargeApproval.findOne({
    where: { construction_ets_recharge_approval_id: id },
    attributes: ["construction_ets_recharge_approval_id"],
  });

  if (!existing) {
    throw new Error("Construction ETS recharge approval not found.");
  }

  await existing.destroy();
}
