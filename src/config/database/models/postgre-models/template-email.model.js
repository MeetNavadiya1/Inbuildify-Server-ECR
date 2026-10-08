import { Model, DataTypes } from "sequelize";

export class TemplateEmail extends Model {
  static associate(models) {
    TemplateEmail.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    TemplateEmail.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    TemplateEmail.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    TemplateEmail.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  TemplateEmail.init({
    template_email_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "standard" },
    subject: { type: DataTypes.STRING(255), allowNull: true },
    email_content: { type: DataTypes.TEXT, allowNull: false },
    additional_recipient_users: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    additional_recipient_groups: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "template_email", modelName: "TemplateEmail", underscored: true });
  return TemplateEmail;
};
