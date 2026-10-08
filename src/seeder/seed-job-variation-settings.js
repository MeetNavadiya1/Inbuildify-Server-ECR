import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_variation_settings for a new builder
 */
export async function seedJobVariationSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobVariationSettings } = db;

  await JobVariationSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      allow_notes_in_variation: false,
      allow_cost_adjustment: false,
      show_notes_in_variation_by_default: false,
      drawing_changes_required: false,
      notify_signed_variation: false,
      notify_signed_variation_only_after_contract_prepared: false,
      allowed_move_job_to_construction_with_pending_variation: false,
      make_requested_by_and_delayed_days_mandatory: false,
      send_mail_when_variation_self_approved: false,
      contract_based_variation_header: false,
      contract_based_variation_header_title: null,
      pre_contract_header: null,
      post_contract_header: null,
      notify_signed_variation_user_ids: [],
      notify_signed_variation_group_ids: [],
      notify_after_contract_user_ids: [],
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobVariationSettings };
