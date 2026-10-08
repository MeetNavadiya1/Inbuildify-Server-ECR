import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

export async function createAgentReferralPartner(data) {
  const { AgentReferralPartner } = db;

  const {
    company_id, builder_id, user_id, address_id,
    account_name, account_bsb, account_number,
    abn, company_name, referred_user_id, created_by,
  } = data;

  const partner = await AgentReferralPartner.create({
    company_id, builder_id, user_id, address_id,
    account_name, account_bsb, account_number,
    abn, company_name, referred_user_id, created_by,
  });
  console.log("🚀 ~ createAgentReferralPartner ~ partner:", partner)

  return partner.toJSON();
}

export async function getAgentReferralPartnerById(partnerId) {
  const { AgentReferralPartner, Address, Users } = db;

  const partner = await AgentReferralPartner.findOne({
    where: { agent_referral_partner_id: partnerId },
    include: [
      {
        model: Address,
        as: "address",
        attributes: ["address_id", "address_line1", "address_line2", "city", "state_id", "country_id", "zip_code"],
      },
      {
        model: Users,
        as: "referredUser",
        attributes: ["users_id", "name", "email"],
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["users_id", "name"],
      },
    ],
  });

  if (!partner) {
    return null;
  }

  const plain = partner.toJSON();

  // Flatten to match original raw query shape
  return {
    ...plain,
    address_line1: plain.address?.address_line1 || null,
    address_line2: plain.address?.address_line2 || null,
    city: plain.address?.city || null,
    state_id: plain.address?.state_id || null,
    country_id: plain.address?.country_id || null,
    zip_code: plain.address?.zip_code || null,
    referred_user_name: plain.referredUser?.name || null,
    referred_user_email: plain.referredUser?.email || null,
    created_by_name: plain.createdByUser?.name || null,
  };
}

// Shared helper to build search/filter conditions
function buildWhereAndUserWhere(query) {
  const { search = "", is_active } = query;

  const partnerWhere = {};
  const userWhere = {};

  if (search) {
    userWhere[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  if (is_active !== undefined) {
    userWhere.is_active = is_active;
  }

  return { partnerWhere, userWhere };
}

export async function getAgentReferralPartnersByBuilder(builderId, query) {
  const { AgentReferralPartner, Address, Users } = db;

  const { page = 1, limit = 25 } = query;
  const offset = (page - 1) * limit;
  const { partnerWhere, userWhere } = buildWhereAndUserWhere(query);

  partnerWhere.builder_id = builderId;

  const { count: total, rows } = await AgentReferralPartner.findAndCountAll({
    where: partnerWhere,
    include: [
      {
        model: Address,
        as: "address",
        attributes: ["address_line1", "address_line2", "city", "state_id", "country_id", "zip_code"],
        required: false,
      },
      {
        model: Users,
        as: "user",
        attributes: ["users_id", "name", "email", "phone", "is_active"],
        where: Object.keys(userWhere).length > 0 ? userWhere : undefined,
        required: Object.keys(userWhere).length > 0,
      },
      {
        model: Users,
        as: "referredUser",
        attributes: ["users_id", "name", "email"],
        required: false,
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["users_id", "name"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset,
    distinct: true,
  });

  return {
    data: rows.map((r) => flattenPartner(r.toJSON())),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
  };
}

export async function getAgentReferralPartnersByCompany(companyId, query) {
  const { AgentReferralPartner, Address, Users } = db;

  const { page = 1, limit = 25 } = query;
  const offset = (page - 1) * limit;
  const { partnerWhere, userWhere } = buildWhereAndUserWhere(query);

  partnerWhere.company_id = companyId;

  const { count: total, rows } = await AgentReferralPartner.findAndCountAll({
    where: partnerWhere,
    include: [
      {
        model: Address,
        as: "address",
        attributes: ["address_line1", "address_line2", "city", "state_id", "country_id", "zip_code"],
        required: false,
      },
      {
        model: Users,
        as: "user",
        attributes: ["users_id", "name", "email", "phone", "is_active"],
        where: Object.keys(userWhere).length > 0 ? userWhere : undefined,
        required: Object.keys(userWhere).length > 0,
      },
      {
        model: Users,
        as: "referredUser",
        attributes: ["users_id", "name", "email"],
        required: false,
      },
      {
        model: Users,
        as: "createdByUser",
        attributes: ["users_id", "name"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset,
    distinct: true,
  });

  return {
    data: rows.map((r) => flattenPartner(r.toJSON())),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
  };
}

export async function updateAgentReferralPartner(partnerId, data) {
  const { AgentReferralPartner } = db;

  const {
    address_id, account_name, account_bsb,
    account_number, abn, company_name,
    referred_user_id, updated_by,
  } = data;

  const partner = await AgentReferralPartner.findOne({
    where: { agent_referral_partner_id: partnerId },
  });

  if (!partner) {
    return null;
  }

  await partner.update({
    address_id, account_name, account_bsb,
    account_number, abn, company_name,
    referred_user_id, updated_by,
  });

  return partner.toJSON();
}

export async function deleteAgentReferralPartner(partnerId) {
  const { AgentReferralPartner, Users } = db;

  const partner = await AgentReferralPartner.findOne({
    where: { agent_referral_partner_id: partnerId },
  });

  if (!partner) {
    return null;
  }

  const userId = partner.user_id;
  const plain = partner.toJSON();

  await partner.destroy();

  if (userId) {
    await Users.update(
      { is_deleted: true },
      { where: { users_id: userId } },
    );
  }

  return plain;
}

export async function getAgentReferralPartnerByEmail(email) {
  const { AgentReferralPartner, Users } = db;

  const partner = await AgentReferralPartner.findOne({
    include: [
      {
        model: Users,
        as: "user",
        where: { email },
        attributes: ["users_id", "email"],
        required: true,
      },
    ],
  });

  return partner ? partner.toJSON() : null;
}

// Helper to flatten nested includes to match original raw query shape
function flattenPartner(plain) {
  return {
    ...plain,
    address_line1: plain.address?.address_line1 || null,
    address_line2: plain.address?.address_line2 || null,
    city: plain.address?.city || null,
    state_id: plain.address?.state_id || null,
    country_id: plain.address?.country_id || null,
    zip_code: plain.address?.zip_code || null,
    referred_user_name: plain.referredUser?.name || null,
    referred_user_email: plain.referredUser?.email || null,
    created_by_name: plain.createdByUser?.name || null,
  };
}

export default {
  createAgentReferralPartner,
  getAgentReferralPartnerById,
  getAgentReferralPartnersByBuilder,
  getAgentReferralPartnersByCompany,
  updateAgentReferralPartner,
  deleteAgentReferralPartner,
  getAgentReferralPartnerByEmail,
};
