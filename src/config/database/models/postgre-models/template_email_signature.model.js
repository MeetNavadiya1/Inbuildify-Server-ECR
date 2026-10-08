import { Model, DataTypes } from "sequelize";

export class TemplateEmailSignature extends Model {
  static associate(models) {
    TemplateEmailSignature.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    TemplateEmailSignature.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    TemplateEmailSignature.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    TemplateEmailSignature.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  TemplateEmailSignature.init(
    {
      template_email_signature_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      include_email_signature: { type: DataTypes.BOOLEAN, defaultValue: false },
      signature_content: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "template_email_signature", modelName: "TemplateEmailSignature", underscored: true },
  );
  return TemplateEmailSignature;
};
