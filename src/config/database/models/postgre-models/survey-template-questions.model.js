import { Model, DataTypes } from "sequelize";

export class SurveyTemplateQuestions extends Model {
  static associate(models) {
    SurveyTemplateQuestions.belongsTo(models.SurveyTemplate, { foreignKey: "survey_template_id", as: "surveyTemplate", onDelete: "CASCADE" });
    SurveyTemplateQuestions.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    SurveyTemplateQuestions.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  SurveyTemplateQuestions.init({
    survey_question_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    survey_template_id: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    option_type: { type: DataTypes.STRING(50), allowNull: false },
    options: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
    is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "survey_template_questions", modelName: "SurveyTemplateQuestions", underscored: true });
  return SurveyTemplateQuestions;
};
