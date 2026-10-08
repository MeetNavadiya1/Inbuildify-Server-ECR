import { Model, DataTypes } from "sequelize";

export class SurveyTemplate extends Model {
  static associate(models) {
    SurveyTemplate.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SurveyTemplate.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SurveyTemplate.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    SurveyTemplate.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    SurveyTemplate.hasMany(models.SurveyTemplateQuestions, { foreignKey: "survey_template_id", as: "questions" });
  }
}

export default (sequelize) => {
  SurveyTemplate.init(
    {
      survey_template_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      is_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "survey_template", modelName: "SurveyTemplate", underscored: true },
  );
  return SurveyTemplate;
};
