import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

const RETURN_FIELDS = [
  "allow_notes_in_variation",
  "allow_cost_adjustment",
  "show_notes_in_variation_by_default",
  "drawing_changes_required",
  "notify_signed_variation",
  "notify_signed_variation_only_after_contract_prepared",
  "allowed_move_job_to_construction_with_pending_variation",
  "make_requested_by_and_delayed_days_mandatory",
  "send_mail_when_variation_self_approved",
  "contract_based_variation_header",
  "contract_based_variation_header_title",
  "pre_contract_header",
  "post_contract_header",
  "notify_signed_variation_user_ids",
  "notify_signed_variation_group_ids",
  "notify_after_contract_user_ids",
  "notify_after_contract_group_ids",
];

// ─── HELPERS ─────────────────────────────

const cleanIds = (ids = []) =>
  [...new Set(ids.filter(Boolean).map((i) => i.trim()))];

async function validateUserIds(userIds, t) {
  if (!userIds?.length) {
    return null;
  }
  const { Users } = db;

  const found = await Users.findAll({
    where: {
      users_id: { [Op.in]: userIds },
      is_deleted: false,
    },
    transaction: t,
  });

  const foundIds = found.map((u) => u.users_id);
  const invalid = userIds.filter((id) => !foundIds.includes(id));

  return invalid.length ? `Invalid user_ids: ${invalid.join(", ")}` : null;
}

async function validateGroupIds(groupIds, builderId, t) {
  if (!groupIds?.length) {
    return null;
  }
  const { UserGroup } = db;

  const groups = await UserGroup.findAll({
    where: {
      user_group_id: { [Op.in]: groupIds },
      builder_id: builderId,
    },
    transaction: t,
  });

  const ids = groups.map((g) => g.user_group_id);
  const invalid = groupIds.filter((id) => !ids.includes(id));

  if (invalid.length) {
    return `Invalid group_ids: ${invalid.join(", ")}`;
  }

  const inactive = groups.filter((g) => !g.is_active).map((g) => g.user_group_id);

  if (inactive.length) {
    return `Inactive group_ids: ${inactive.join(", ")}`;
  }

  return null;
}

function filterResponse(record) {
  const plain = record.get({ plain: true });
  return Object.fromEntries(RETURN_FIELDS.map((k) => [k, plain[k]]));
}

// ─── CREATE ─────────────────────────────

export async function createJobVariationSettingsService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobVariationSettings } = db;
    const { company_id, builder_id, user_id } = user;

    const existing = await JobVariationSettings.findOne({
      where: { company_id, builder_id },
      transaction: t,
    });

    if (existing) {
      throw new Error("Settings already exist");
    }

    const allUserIds = cleanIds([
      ...(data.notify_signed_variation_user_ids || []),
      ...(data.notify_after_contract_user_ids || []),
    ]);

    const userErr = await validateUserIds(allUserIds, t);
    if (userErr) {
      throw new Error(userErr);
    }

    const allGroupIds = cleanIds([
      ...(data.notify_signed_variation_group_ids || []),
      ...(data.notify_after_contract_group_ids || []),
    ]);

    const groupErr = await validateGroupIds(allGroupIds, builder_id, t);
    if (groupErr) {
      throw new Error(groupErr);
    }

    const created = await JobVariationSettings.create(
      {
        ...data,
        company_id,
        builder_id,
        created_by: user_id,
        updated_by: user_id,
      },
      { transaction: t },
    );

    await t.commit();
    return filterResponse(created);

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── UPDATE ─────────────────────────────

export async function updateJobVariationSettingsService(data, user) {
  const t = await db.sequelize.transaction();

  try {
    const { JobVariationSettings } = db;
    const { builder_id, user_id } = user;

    const record = await JobVariationSettings.findOne({
      where: { builder_id },
      transaction: t,
    });

    if (!record) {
      throw new Error("Settings not found");
    }

    const allUserIds = cleanIds([
      ...(data.notify_signed_variation_user_ids || []),
      ...(data.notify_after_contract_user_ids || []),
    ]);

    const userErr = await validateUserIds(allUserIds, t);
    if (userErr) {
      throw new Error(userErr);
    }

    const allGroupIds = cleanIds([
      ...(data.notify_signed_variation_group_ids || []),
      ...(data.notify_after_contract_group_ids || []),
    ]);

    const groupErr = await validateGroupIds(allGroupIds, builder_id, t);
    if (groupErr) {
      throw new Error(groupErr);
    }

    await record.update(
      {
        ...data,
        updated_by: user_id,
      },
      { transaction: t },
    );

    await t.commit();
    return filterResponse(record);

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── GET ─────────────────────────────

export async function getJobVariationSettingsService(user) {
  const { JobVariationSettings } = db;
  const { company_id, builder_id, user_id } = user;

  let record = await JobVariationSettings.findOne({
    where: { company_id, builder_id },
    attributes: RETURN_FIELDS,
  });

  if (!record) {
    await JobVariationSettings.create({
      company_id,
      builder_id,
      created_by: user_id,
      updated_by: user_id,
    });

    record = await JobVariationSettings.findOne({
      where: { company_id, builder_id },
      attributes: RETURN_FIELDS,
    });
  }

  return record.get({ plain: true });
}
