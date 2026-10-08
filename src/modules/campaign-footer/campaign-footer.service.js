import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function createCampaignFooter(currentUser, body) {
  const { CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const { name, content, background_color, is_default } = body;

  if (is_default) {
    await CampaignFooter.update(
      { is_default: false },
      { where: { ...(builderId ? { builder_id: builderId } : { company_id: companyId }), is_deleted: false } }
    );
  }

  const footer = await CampaignFooter.create({
    company_id: companyId || null,
    builder_id: builderId || null,
    name,
    content: content || null,
    background_color: background_color || null,
    is_default: is_default || false,
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(footer.get({ plain: true }));
}

export async function getCampaignFooters(currentUser) {
  const { CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const where = { is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const footers = await CampaignFooter.findAll({
    where,
    order: [["is_default", "DESC"], ["created_at", "DESC"]],
  });

  return footers.map((f) => keysToCamelCase(f.get({ plain: true })));
}

export async function getCampaignFooterById(currentUser, footerId) {
  const { CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const where = { campaign_footer_id: footerId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const footer = await CampaignFooter.findOne({ where });
  if (!footer) throw { status: 404, message: "Campaign footer not found." };

  return keysToCamelCase(footer.get({ plain: true }));
}

export async function updateCampaignFooter(currentUser, footerId, body) {
  const { CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_footer_id: footerId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const footer = await CampaignFooter.findOne({ where });
  if (!footer) throw { status: 404, message: "Campaign footer not found." };

  const { name, content, background_color, is_default } = body;

  if (is_default) {
    await CampaignFooter.update(
      { is_default: false },
      { where: { ...(builderId ? { builder_id: builderId } : { company_id: companyId }), is_deleted: false } }
    );
  }

  const updateData = { updated_by: userId };
  if (name !== undefined) updateData.name = name;
  if (content !== undefined) updateData.content = content;
  if (background_color !== undefined) updateData.background_color = background_color;
  if (is_default !== undefined) updateData.is_default = is_default;

  await footer.update(updateData);
  return keysToCamelCase(footer.get({ plain: true }));
}

export async function deleteCampaignFooter(currentUser, footerId) {
  const { CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_footer_id: footerId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const footer = await CampaignFooter.findOne({ where });
  if (!footer) throw { status: 404, message: "Campaign footer not found." };

  await footer.update({ is_deleted: true, updated_by: userId });
  return { campaignFooterId: footerId };
}

export default {
  createCampaignFooter,
  getCampaignFooters,
  getCampaignFooterById,
  updateCampaignFooter,
  deleteCampaignFooter,
};
