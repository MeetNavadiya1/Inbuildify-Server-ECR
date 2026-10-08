import { Model, DataTypes } from "sequelize";

export class EmailTemplates extends Model {
  static associate(models) {}
}
export default (sequelize) => {
  EmailTemplates.init({
    template_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    template_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    category: { type: DataTypes.STRING(100), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    cta_text: { type: DataTypes.STRING(100), allowNull: true },
    cta_link: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "email_templates", modelName: "EmailTemplates", underscored: true, updatedAt: false });
  return EmailTemplates;
};
