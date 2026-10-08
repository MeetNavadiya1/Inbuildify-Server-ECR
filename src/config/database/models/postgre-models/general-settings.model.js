import { Model, DataTypes } from "sequelize";

export class GeneralSettings extends Model {
  static associate(models) {
    GeneralSettings.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    GeneralSettings.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}
export default (sequelize) => {
  GeneralSettings.init({
    id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    notification_referral_partner: { type: DataTypes.BOOLEAN, defaultValue: false },
    pdf_password_protected: { type: DataTypes.BOOLEAN, defaultValue: false },
    pdf_password: { type: DataTypes.STRING(255), allowNull: true },
    round_of_cost: { type: DataTypes.BOOLEAN, defaultValue: false },
    negative_value_show: { type: DataTypes.BOOLEAN, defaultValue: true },
    negative_value_color: { type: DataTypes.STRING(50), defaultValue: "#F00000" },
    show_reference_id_in_pdf: { type: DataTypes.ENUM("document_id", "job_id", "document_id_and_job_id", "hide_document_id_and_job_id"), defaultValue: "hide_document_id_and_job_id" },
    job_id_label: { type: DataTypes.STRING(100), allowNull: true },
    editable_pdf_types: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
    // Reference-type keys nobody may edit. A blocklist, so the empty default
    // means "everything is editable" — which is what every tenant already has.
    non_editable_document_types: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  }, { sequelize, tableName: "general_settings", modelName: "GeneralSettings", underscored: true, timestamps: false });
  return GeneralSettings;
};
