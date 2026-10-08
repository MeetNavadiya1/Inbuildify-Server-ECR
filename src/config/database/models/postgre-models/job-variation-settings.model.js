import { Model, DataTypes } from "sequelize";

export class JobVariationSettings extends Model {
  static associate(models) {
    JobVariationSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobVariationSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobVariationSettings.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobVariationSettings.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobVariationSettings.init(
    {
      job_variation_settings_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      allow_notes_in_variation: { type: DataTypes.BOOLEAN, defaultValue: false },
      allow_cost_adjustment: { type: DataTypes.BOOLEAN, defaultValue: false },
      show_notes_in_variation_by_default: { type: DataTypes.BOOLEAN, defaultValue: false },
      drawing_changes_required: { type: DataTypes.BOOLEAN, defaultValue: false },
      notify_signed_variation: { type: DataTypes.BOOLEAN, defaultValue: false },
      notify_signed_variation_only_after_contract_prepared: { type: DataTypes.BOOLEAN, defaultValue: false },
      allowed_move_job_to_construction_with_pending_variation: { type: DataTypes.BOOLEAN, defaultValue: false },
      make_requested_by_and_delayed_days_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
      send_mail_when_variation_self_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
      contract_based_variation_header: { type: DataTypes.BOOLEAN, defaultValue: false },
      contract_based_variation_header_title: { type: DataTypes.STRING(255), allowNull: true },
      pre_contract_header: { type: DataTypes.STRING(255), allowNull: true },
      post_contract_header: { type: DataTypes.STRING(255), allowNull: true },
      notify_signed_variation_user_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      notify_signed_variation_group_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      notify_after_contract_user_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      notify_after_contract_group_ids: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_variation_settings", modelName: "JobVariationSettings", underscored: true },
  );
  return JobVariationSettings;
};
