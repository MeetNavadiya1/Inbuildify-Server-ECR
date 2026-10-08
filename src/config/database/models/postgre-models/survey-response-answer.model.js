import { Model, DataTypes } from "sequelize";

export class SurveyResponseAnswer extends Model {
  static associate(models) {
    SurveyResponseAnswer.belongsTo(models.SurveyResponse, { foreignKey: "survey_response_id", as: "surveyResponse", onDelete: "CASCADE" });
    SurveyResponseAnswer.belongsTo(models.SurveyTemplateQuestions, { foreignKey: "survey_question_id", as: "question", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  SurveyResponseAnswer.init(
    {
      survey_response_answer_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      survey_response_id: { type: DataTypes.UUID, allowNull: false },
      survey_question_id: { type: DataTypes.UUID, allowNull: true },
      question_description: { type: DataTypes.TEXT, allowNull: false },
      option_type: { type: DataTypes.STRING(50), allowNull: false },
      answer_text: { type: DataTypes.TEXT, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "survey_response_answer", modelName: "SurveyResponseAnswer", underscored: true },
  );
  return SurveyResponseAnswer;
};
